import AppKit
import SwiftUI
import WebKit
import UniformTypeIdentifiers

@MainActor @Observable
final class EditorHost: NSObject, WKScriptMessageHandlerWithReply, WKNavigationDelegate, WKUIDelegate {
    var webView: WKWebView!
    var server: MCPServer?
    var serverStatus = "Starting"
    var fileCommandInProgress = false
    var fileURL: URL?
    var pendingOpenURL: URL?
    var fileFingerprint: String?
    var pendingFingerprint: String?
    let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("SugarMaple", isDirectory: true)

    override init() {
        super.init()
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(EditorResources(), forURLScheme: "sugar-maple")
        config.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "native")
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.isInspectable = true
        webView.setValue(false, forKey: "drawsBackground")
        webView.load(URLRequest(url: URL(string: "sugar-maple://app/index.html")!))
        do {
            try FileManager.default.createDirectory(at: support, withIntermediateDirectories: true)
            server = try MCPServer(host: self)
        } catch { serverStatus = "MCP error: \(error.localizedDescription)" }
    }
    enum FileCommand: String {
        case new, open, save, saveAs
    }
    func fileCommand(_ command: FileCommand) {
        guard !fileCommandInProgress else { return }
        fileCommandInProgress = true
        Task { @MainActor in
            defer { fileCommandInProgress = false }
            do {
                _ = try await webView.callAsyncJavaScript(
                    "if (!window.sugarMaple?.ready) throw new Error('Editor loading'); await window.sugarMaple.fileCommand(command); return true;",
                    arguments: ["command": command.rawValue], in: nil, contentWorld: .page
                )
            } catch {
                let alert = NSAlert()
                alert.messageText = "File action could not finish"
                alert.informativeText = error.localizedDescription
                if let window = webView.window { await alert.beginSheetModal(for: window) }
            }
        }
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        guard frame.isMainFrame, frame.securityOrigin.protocol == "sugar-maple",
              let window = webView.window else { completionHandler(false); return }
        let alert = NSAlert()
        alert.messageText = message
        alert.addButton(withTitle: "Continue")
        alert.addButton(withTitle: "Cancel").keyEquivalent = "\u{1b}"
        alert.beginSheetModal(for: window) { response in
            completionHandler(response == .alertFirstButtonReturn)
        }
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        guard message.frameInfo.isMainFrame, message.frameInfo.securityOrigin.protocol == "sugar-maple",
              let body = message.body as? [String: Any], let action = body["action"] as? String else {
            replyHandler(nil, "Invalid native request"); return
        }
        Task { @MainActor in
            do { replyHandler(try await native(action, body), nil) }
            catch { replyHandler(nil, error.localizedDescription) }
        }
    }
    func native(_ action: String, _ body: [String: Any]) async throws -> Any {
        switch action {
        case "status": return ["status": serverStatus]
        case "clipboard.write":
            guard let text = body["text"] as? String else { throw HostError.message("Missing clipboard text") }
            NSPasteboard.general.clearContents(); NSPasteboard.general.setString(text, forType: .string)
            return ["ok": true]
        case "clipboard.read": return ["text": NSPasteboard.general.string(forType: .string) ?? ""]
        case "file.reset": fileURL = nil; fileFingerprint = nil; return ["ok": true]
        case "file.acceptOpen": fileURL = pendingOpenURL; fileFingerprint = pendingFingerprint; pendingOpenURL = nil; pendingFingerprint = nil; return ["ok": true]
        case "recovery.load":
            let url = support.appendingPathComponent("recovery.json")
            return FileManager.default.fileExists(atPath: url.path) ? try JSONSerialization.jsonObject(with: Data(contentsOf: url)) : NSNull()
        case "recovery.save":
            guard let value = body["value"] else { throw HostError.message("Missing checkpoint") }
            try JSONSerialization.data(withJSONObject: value).write(to: support.appendingPathComponent("recovery.json"), options: .atomic)
            return ["ok": true]
        case "file.export":
            guard let name = body["name"] as? String else { throw HostError.message("Missing export name") }
            let data: Data
            if let text = body["text"] as? String { data = Data(text.utf8) }
            else if let base64 = body["base64"] as? String, let decoded = Data(base64Encoded: base64) { data = decoded }
            else { throw HostError.message("Missing export data") }
            let panel = NSSavePanel(); panel.nameFieldStringValue = name
            guard await panel.begin() == .OK, let url = panel.url else { return ["cancelled": true] }
            try data.write(to: url, options: .atomic); return ["ok": true]
        case "file.save":
            guard let value = body["value"] as? [String: Any], let document = value["document"] as? [String: Any] else { throw HostError.message("Missing document") }
            var destination = fileURL
            if destination == nil || body["saveAs"] as? Bool == true {
                let panel = NSSavePanel(); panel.nameFieldStringValue = "\(document["name"] as? String ?? "Untitled").syrup"
                panel.canCreateDirectories = true; panel.title = "Save Sugar Maple document"
                guard await panel.begin() == .OK, let url = panel.url else { return ["cancelled": true] }
                destination = url
            }
            let url = destination!
            try DocumentPackage.write(value, to: url, expectedFingerprint: url == fileURL ? fileFingerprint : nil)
            fileURL = url; fileFingerprint = try DocumentPackage.fingerprint(url)
            return ["ok": true]
        case "file.open":
            let panel = NSOpenPanel(); panel.canChooseDirectories = true; panel.canChooseFiles = true
            panel.allowsMultipleSelection = false; panel.title = "Open .syrup document"
            guard await panel.begin() == .OK, let url = panel.url else { return ["cancelled": true] }
            let result = try DocumentPackage.read(url); pendingOpenURL = url; pendingFingerprint = try DocumentPackage.fingerprint(url)
            return result
        default: throw HostError.message("Unknown native action")
        }
    }
    func dispatch(_ method: String, _ args: [String: Any]) async throws -> Any {
        guard let value = try await webView.callAsyncJavaScript(
            "if (!window.sugarMaple?.ready) throw new Error('Editor loading'); return await window.sugarMaple.dispatch(method, args);",
            arguments: ["method": method, "args": args], in: nil, contentWorld: .page
        ) else { throw HostError.message("Editor returned no result") }
        return value
    }
    func snapshot(_ args: [String: Any]) async throws -> [String: Any] {
        let revision = try await dispatch("render.ready", args)
        let image = try await webView.takeSnapshot(configuration: nil)
        _ = try await dispatch("render.ready", args)
        guard let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff), let png = rep.representation(using: .png, properties: [:]) else { throw HostError.message("Snapshot encoding failed") }
        return ["content": [["type": "image", "mimeType": "image/png", "data": png.base64EncodedString()], ["type": "text", "text": String(data: try JSONSerialization.data(withJSONObject: revision), encoding: .utf8)!]]]
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        decisionHandler(navigationAction.request.url?.scheme == "sugar-maple" ? .allow : .cancel)
    }
}
enum HostError: LocalizedError {
    case message(String)
    var errorDescription: String? { if case .message(let message) = self { return message }; return nil }
}

final class EditorResources: NSObject, WKURLSchemeHandler {
    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url,
              let root = Bundle.main.resourceURL?.appendingPathComponent("Editor", isDirectory: true) else { return }
        let path = url.path == "/" ? "/index.html" : url.path
        let file = root.appendingPathComponent(path).standardizedFileURL
        guard file.path.hasPrefix(root.path + "/"), let data = try? Data(contentsOf: file) else {
            urlSchemeTask.didFailWithError(HostError.message("Bundled editor asset missing: \(path). Run bun run build:mac.")); return
        }
        let mime = ["html":"text/html", "js":"application/javascript", "css":"text/css", "svg":"image/svg+xml", "woff2":"font/woff2", "ico":"image/x-icon"][file.pathExtension] ?? "application/octet-stream"
        urlSchemeTask.didReceive(URLResponse(url: url, mimeType: mime, expectedContentLength: data.count, textEncodingName: "utf-8"))
        urlSchemeTask.didReceive(data); urlSchemeTask.didFinish()
    }
    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
}
