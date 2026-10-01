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
    var pendingOpenURL: URL?
    var pendingFingerprint: String?
    let support: URL = {
        #if DEBUG
        if let path = Bundle.main.object(forInfoDictionaryKey: "SugarMapleTestSupport") as? String { return URL(fileURLWithPath: path, isDirectory: true) }
        #endif
        return FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("SugarMaple", isDirectory: true)
    }()
    let mcpPort: UInt16 = {
        #if DEBUG
        if let number = Bundle.main.object(forInfoDictionaryKey: "SugarMapleTestPort") as? NSNumber, let port = UInt16(exactly: number.intValue), port > 0 { return port }
        #endif
        return 48480
    }()

    @ObservationIgnored lazy var persistence = DocumentPersistence(root: support)

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
        guard frame.isMainFrame, NativeAccessPolicy.trustedOrigin(scheme: frame.securityOrigin.protocol, host: frame.securityOrigin.host, port: frame.securityOrigin.port),
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
        guard message.frameInfo.isMainFrame, NativeAccessPolicy.trustedOrigin(scheme: message.frameInfo.securityOrigin.protocol, host: message.frameInfo.securityOrigin.host, port: message.frameInfo.securityOrigin.port),
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
        case "window.close":
            webView.window?.performClose(nil)
            return ["ok": true]
        case "window.drag":
            if let event = NSApp.currentEvent, event.type == .leftMouseDown, let window = webView.window {
                window.performDrag(with: event)
            }
            return ["ok": true]
        case "clipboard.write":
            guard let text = body["text"] as? String else { throw HostError.message("Missing clipboard text") }
            NSPasteboard.general.clearContents(); NSPasteboard.general.setString(text, forType: .string)
            return ["ok": true]
        case "clipboard.read": return ["text": NSPasteboard.general.string(forType: .string) ?? ""]
        case "file.reset": return ["ok": true]
        case "file.acceptOpen":
            guard let url = pendingOpenURL, let fingerprint = pendingFingerprint,
                  let id = body["documentId"] as? String else { throw HostError.message("Missing opened file") }
            try await persistence.adopt(url, id: id, fingerprint: fingerprint)
            pendingOpenURL = nil; pendingFingerprint = nil
            return ["ok": true]
        case "recovery.load":
            guard let data = try await persistence.load() else { return NSNull() }
            return try JSONSerialization.jsonObject(with: data)
        case "file.autosave":
            guard let value = body["value"] else { throw HostError.message("Missing checkpoint") }
            let data = try JSONSerialization.data(withJSONObject: value)
            let managed = try await persistence.save(data)
            return ["ok": true, "managed": managed]
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
            guard let id = document["id"] as? String else { throw HostError.message("Missing document ID") }
            var destination = try await persistence.destination(id)
            if destination == nil || body["saveAs"] as? Bool == true {
                let panel = NSSavePanel(); panel.nameFieldStringValue = "\(document["name"] as? String ?? "Untitled").syrup"
                panel.allowedContentTypes = [UTType(exportedAs: "io.zubair.SugarMaple.document", conformingTo: .package)]
                panel.canCreateDirectories = true; panel.title = "Save Sugar Maple document"
                guard await panel.begin() == .OK, let url = panel.url else { return ["cancelled": true] }
                destination = url
            }
            let url = destination!
            let data = try JSONSerialization.data(withJSONObject: value)
            try await persistence.save(data, to: url)
            return ["ok": true, "name": url.deletingPathExtension().lastPathComponent]
        case "file.open":
            let panel = NSOpenPanel(); panel.canChooseDirectories = false; panel.canChooseFiles = true
            panel.treatsFilePackagesAsDirectories = false
            panel.allowedContentTypes = [UTType(exportedAs: "io.zubair.SugarMaple.document", conformingTo: .package)]
            panel.allowsMultipleSelection = false; panel.title = "Open .syrup document"
            guard await panel.begin() == .OK, let url = panel.url else { return ["cancelled": true] }
            let data = try await persistence.read(url)
            guard var result = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                throw CocoaError(.fileReadCorruptFile)
            }
            pendingOpenURL = url; pendingFingerprint = try await persistence.fingerprint(url)
            result["fileName"] = url.deletingPathExtension().lastPathComponent
            return result
        default: throw HostError.message("Unknown native action")
        }
    }
    func dispatch(_ method: String, _ args: [String: Any]) async throws -> Any {
        guard let result = try await webView.callAsyncJavaScript(
            """
            try {
              if (!window.sugarMaple?.ready) return {ok:false,error:{code:'loading',message:'Editor loading',recoveryAction:'Wait for readiness and retry.'}};
              return {ok:true,value:await window.sugarMaple.dispatch(method,args)};
            } catch(error) {
              return {ok:false,error:window.sugarMaple.describeError(error)};
            }
            """,
            arguments: ["method": method, "args": args], in: nil, contentWorld: .page
        ) as? [String: Any] else { throw HostError.message("Editor returned no result") }
        if result["ok"] as? Bool != true {
            throw HostError.tool(result["error"] as? [String: Any] ?? ["code":"internal_error", "message":"Editor returned an invalid error"])
        }
        guard let value = result["value"] else { throw HostError.message("Editor returned no value") }
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
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if NativeAccessPolicy.trustedURL(url) { decisionHandler(.allow); return }
        // Only a human-activated web link leaves the application; subframes stay unprivileged.
        if navigationAction.navigationType == .linkActivated,
           navigationAction.targetFrame?.isMainFrame != false,
           ["https", "http"].contains(url.scheme ?? "") {
            NSWorkspace.shared.open(url)
        }
        decisionHandler(.cancel)
    }
}
enum HostError: LocalizedError {
    case message(String)
    case tool([String: Any])
    var errorDescription: String? {
        switch self {
        case .message(let message): return message
        case .tool(let details): return String(data: (try? JSONSerialization.data(withJSONObject: details, options: [.sortedKeys])) ?? Data(), encoding: .utf8)
        }
    }
}

final class EditorResources: NSObject, WKURLSchemeHandler {
    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url,
              let root = Bundle.main.resourceURL?.appendingPathComponent("Editor", isDirectory: true) else { return }
        let path = url.path
        guard let file = try? NativeAccessPolicy.resourceURL(url, root: root),
              let data = try? Data(contentsOf: file) else {
            urlSchemeTask.didFailWithError(HostError.message("Bundled editor asset missing: \(path). Run bun run build:mac.")); return
        }
        let mime = ["html":"text/html", "js":"application/javascript", "css":"text/css", "svg":"image/svg+xml", "woff2":"font/woff2", "ico":"image/x-icon"][file.pathExtension] ?? "application/octet-stream"
        urlSchemeTask.didReceive(URLResponse(url: url, mimeType: mime, expectedContentLength: data.count, textEncodingName: "utf-8"))
        urlSchemeTask.didReceive(data); urlSchemeTask.didFinish()
    }
    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
}
