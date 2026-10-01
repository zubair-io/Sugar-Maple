import AppKit
import WebKit

/// Read-only scene renderer. This WebView never receives the editor's native
/// handler, document persistence, MCP server, or persistent website data store.
@MainActor
final class PreviewWindow: NSObject, NSWindowDelegate, WKNavigationDelegate, WKScriptMessageHandlerWithReply {
    let window: NSWindow
    let webView: WKWebView
    private weak var owner: NSWindow?
    private let onClose: (String) -> Void
    private var ownerObserver: NSObjectProtocol?
    private var latest: [String: Any]
    private let documentId: String
    private let rootId: String
    private var revision: Int
    private var ready = false
    private var delivering = false
    private(set) var closed = false
    private var readiness: Task<Void, Never>?

    init(value: [String: Any], resources: URL, owner: NSWindow?, onClose: @escaping (String) -> Void) throws {
        let metadata = try Self.metadata(value)
        latest = value; documentId = metadata.0; revision = metadata.1; rootId = metadata.2
        self.owner = owner; self.onClose = onClose
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.setURLSchemeHandler(PreviewResources(root: resources), forURLScheme: "sugar-maple")
        // Install before bundled code. Scene schema/bindings accept no executable
        // content; this additionally denies connections, frames and external assets.
        config.userContentController.addUserScript(WKUserScript(source: """
            const policy=document.createElement('meta');
            policy.httpEquiv='Content-Security-Policy';
            policy.content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'";
            (document.head||document.documentElement).prepend(policy);
            """, injectionTime: .atDocumentStart, forMainFrameOnly: false))
        webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 1100, height: 800), configuration: config)
        window = NSWindow(contentRect: webView.frame, styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        super.init()
        window.title = "Sugar Maple · Preview"; window.isReleasedWhenClosed = false
        window.minSize = NSSize(width: 600, height: 420); window.contentView = webView; window.delegate = self
        config.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "preview")
        webView.navigationDelegate = self
        if let owner {
            ownerObserver = NotificationCenter.default.addObserver(forName: NSWindow.willCloseNotification, object: owner, queue: .main) { [weak self] _ in
                Task { @MainActor in self?.close() }
            }
        }
        webView.load(URLRequest(url: URL(string: "sugar-maple://preview/index.html#preview")!))
        window.center(); window.makeKeyAndOrderFront(nil)
    }
    private static func metadata(_ value: [String: Any]) throws -> (String, Int, String) {
        guard value["version"] as? Int == 1,
              let id = value["documentId"] as? String, !id.isEmpty,
              let revision = value["revision"] as? Int, revision >= 0,
              let root = value["rootId"] as? String, !root.isEmpty,
              let doc = value["document"] as? [String: Any], doc["id"] as? String == id,
              let nodes = doc["nodes"] as? [[String: Any]], nodes.count <= 10000,
              nodes.contains(where: { $0["id"] as? String == root && $0["kind"] as? String == "artboard" && $0["hidden"] as? Bool != true }),
              try JSONSerialization.data(withJSONObject: value).count <= 32_000_000 else {
            throw CocoaError(.fileReadCorruptFile)
        }
        return (id, revision, root)
    }
    func update(_ value: [String: Any]) throws {
        guard !closed else { return }
        guard value["documentId"] as? String == documentId, value["rootId"] as? String == rootId else {
            close(error: "Document changed. Start a new preview."); return
        }
        // Root deletion is reconciled in the renderer so the author receives its
        // actionable diagnostic, rather than leaving a stale window visible.
        guard let next = value["revision"] as? Int, next > revision else { return }
        if let nodes = (value["document"] as? [String: Any])?["nodes"] as? [[String: Any]],
           !nodes.contains(where: { $0["id"] as? String == rootId && $0["kind"] as? String == "artboard" && $0["hidden"] as? Bool != true }) {
            close(error: "The starting artboard is no longer available."); return
        }
        _ = try Self.metadata(value)
        revision = next; latest = value; deliver()
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        readiness?.cancel()
        readiness = Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                for _ in 0..<250 {
                    if closed || Task.isCancelled { return }
                    if try await webView.evaluateJavaScript("!!window.sugarMaplePreview?.ready") as? Bool == true {
                        ready = true; deliver(); return
                    }
                    try await Task.sleep(for: .milliseconds(20))
                }
                close(error: "Preview did not finish loading. Return to the editor and retry.")
            } catch { if !Task.isCancelled { close(error: "Preview could not load: \(error.localizedDescription)") } }
        }
    }
    private func deliver() {
        guard ready, !closed, !delivering else { return }
        delivering = true
        Task { @MainActor [weak self] in
            guard let self else { return }
            defer { delivering = false }
            do {
                while !closed {
                    let value = latest, sendingRevision = revision
                    _ = try await webView.callAsyncJavaScript("return await window.sugarMaplePreview.receive(value);", arguments: ["value": value], in: nil, contentWorld: .page)
                    if sendingRevision == revision { break }
                }
            } catch { if !closed { close(error: "Preview update failed: \(error.localizedDescription)") } }
        }
    }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        guard !closed, message.frameInfo.isMainFrame,
              message.frameInfo.securityOrigin.protocol == "sugar-maple",
              message.frameInfo.securityOrigin.host == "preview", message.frameInfo.securityOrigin.port == 0,
              let body = message.body as? [String: Any], Set(body.keys).isSubset(of: ["action", "error"]),
              let action = body["action"] as? String, ["close", "returnToEditor"].contains(action),
              body["error"] == nil || body["error"] is String else { replyHandler(nil, "Invalid preview request"); return }
        let error = String((body["error"] as? String ?? "").prefix(1000))
        replyHandler(["ok": true], nil)
        Task { @MainActor [weak self] in self?.close(error: error) }
    }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url, url.scheme == "sugar-maple", url.host == "preview",
              url.port == nil, url.user == nil, url.password == nil,
              url.path == "/index.html", url.fragment == "preview", action.targetFrame?.isMainFrame == true else {
            decisionHandler(.cancel); return
        }
        decisionHandler(.allow)
    }
    func windowWillClose(_ notification: Notification) { close() }
    func close(error: String = "", notify: Bool = true) {
        guard !closed else { return }
        closed = true; readiness?.cancel(); readiness = nil
        if let ownerObserver { NotificationCenter.default.removeObserver(ownerObserver); self.ownerObserver = nil }
        webView.stopLoading()
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "preview", contentWorld: .page)
        webView.navigationDelegate = nil; window.delegate = nil
        // Explicit Angular destruction cancels prototype timers/listeners. Remove
        // the document afterwards even if destruction fails in a crashed process.
        let view = webView
        Task { @MainActor in
            _ = try? await view.evaluateJavaScript("window.sugarMaplePreview?.dispose();")
            view.loadHTMLString("", baseURL: nil)
        }
        window.close(); owner?.makeKeyAndOrderFront(nil)
        if notify { onClose(error) }
    }
}

private final class PreviewResources: NSObject, WKURLSchemeHandler {
    let root: URL
    init(root: URL) { self.root = root; super.init() }
    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        do {
            guard let url = task.request.url else { throw CocoaError(.fileReadNoPermission) }
            let file = try NativeAccessPolicy.resourceURL(url, root: root, host: .preview)
            let data = try Data(contentsOf: file)
            let types = ["html":"text/html", "js":"text/javascript", "css":"text/css", "woff2":"font/woff2", "woff":"font/woff", "svg":"image/svg+xml", "png":"image/png", "json":"application/json"]
            task.didReceive(URLResponse(url: url, mimeType: types[file.pathExtension] ?? "application/octet-stream", expectedContentLength: data.count, textEncodingName: ["html","js","css","json"].contains(file.pathExtension) ? "utf-8" : nil))
            task.didReceive(data); task.didFinish()
        } catch { task.didFailWithError(error) }
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}
