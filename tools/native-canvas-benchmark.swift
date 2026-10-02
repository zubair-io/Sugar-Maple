import AppKit
import WebKit
import Darwin

// A fresh, visible engine harness with the production editor bundle. It shares
// the app's origin/resource policy. Recovery is a fixed in-memory fixture;
// clipboard, disk I/O, MCP and other native capabilities are not exposed.
@MainActor final class BenchmarkResources: NSObject, WKURLSchemeHandler {
    let root: URL
    init(_ root: URL) { self.root = root }
    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        do {
            guard let url = task.request.url else { throw CocoaError(.fileReadUnknown) }
            let file = try NativeAccessPolicy.resourceURL(url, root: root)
            let data = try Data(contentsOf: file)
            let mime = ["html":"text/html", "js":"application/javascript", "css":"text/css", "woff2":"font/woff2", "svg":"image/svg+xml"][file.pathExtension] ?? "application/octet-stream"
            task.didReceive(URLResponse(url: url, mimeType: mime, expectedContentLength: data.count, textEncodingName: "utf-8"))
            task.didReceive(data); task.didFinish()
        } catch { task.didFailWithError(error) }
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}
@MainActor final class BenchmarkBridge: NSObject, WKScriptMessageHandlerWithReply {
    let fixture: Any
    init(_ fixture: Any) { self.fixture = fixture }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        guard message.frameInfo.isMainFrame,
              NativeAccessPolicy.trustedOrigin(scheme: message.frameInfo.securityOrigin.protocol, host: message.frameInfo.securityOrigin.host, port: message.frameInfo.securityOrigin.port),
              let body = message.body as? [String: Any], let action = body["action"] as? String else { replyHandler(nil, "Denied"); return }
        switch action {
        case "recovery.load": replyHandler(fixture, nil)
        case "status": replyHandler(["status":"Isolated engine benchmark"], nil)
        case "file.autosave": replyHandler(["ok":true, "managed":false], nil)
        default: replyHandler(nil, "Capability absent in benchmark")
        }
    }
}
@main struct CanvasBenchmark {
    @MainActor static func main() {
        let app = NSApplication.shared
        app.setActivationPolicy(.regular)
        Task { @MainActor in
            do { try await measure(); app.terminate(nil) }
            catch {
                FileHandle.standardError.write(Data("Native benchmark failed: \(error)\n".utf8))
                exit(1)
            }
        }
        // Run AppKit's actual event loop: an async command-line main can evaluate
        // JavaScript while never making its window unoccluded on the WindowServer.
        app.run()
    }
    @MainActor static func measure() async throws {
        guard CommandLine.arguments.count == 6 else { fatalError("Pass resources, fixture, page harness, report and screenshot") }
        let args = CommandLine.arguments
        let fixture = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: args[2])))
        guard let value = fixture as? [String:Any], let document = value["document"] as? [String:Any], let nodes = document["nodes"] as? [[String:Any]] else { fatalError("Invalid fixture") }
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.setURLSchemeHandler(BenchmarkResources(URL(fileURLWithPath: args[1], isDirectory: true)), forURLScheme: "sugar-maple")
        config.userContentController.addScriptMessageHandler(BenchmarkBridge(fixture), contentWorld: .page, name: "native")
        let webView = WKWebView(frame: NSRect(x:0, y:0, width:1440, height:1000), configuration:config)
        let window = NSWindow(contentRect: webView.frame, styleMask:[.titled, .closable], backing:.buffered, defer:false)
        window.title = "Sugar Maple isolated Canvas benchmark"
        window.isReleasedWhenClosed = false
        window.contentView = webView; window.center(); window.makeKeyAndOrderFront(nil)
        window.orderFrontRegardless()
        NSApplication.shared.activate(ignoringOtherApps:true)
        defer { webView.stopLoading(); config.userContentController.removeScriptMessageHandler(forName:"native"); window.close() }
        webView.load(URLRequest(url:URL(string:"sugar-maple://app/index.html")!))
        var ready = false
        for _ in 0..<1500 {
            if (try? await webView.evaluateJavaScript("window.sugarMaple?.ready === true")) as? Bool == true { ready = true; break }
            try await Task.sleep(for:.milliseconds(20))
        }
        precondition(ready, "Production WKWebView did not become ready")
        for _ in 0..<100 {
            if window.isVisible && window.occlusionState.contains(.visible) { break }
            window.orderFrontRegardless()
            try await Task.sleep(for:.milliseconds(20))
        }
        precondition(window.isVisible && window.occlusionState.contains(.visible), "Window must be visible")
        let script = try String(contentsOfFile:args[3], encoding:.utf8)
        guard let result = try await webView.callAsyncJavaScript(script + "\nreturn await window.canvasBenchmark(total);", arguments:["total":nodes.count], in:nil, contentWorld:.page) as? [String:Any] else { fatalError("Missing benchmark result") }
        precondition(window.isVisible && window.occlusionState.contains(.visible), "Benchmark window became hidden")
        let image = try await webView.takeSnapshot(configuration:nil)
        guard let tiff = image.tiffRepresentation, let bitmap = NSBitmapImageRep(data:tiff), let png = bitmap.representation(using:.png, properties:[:]) else { fatalError("Missing screenshot") }
        try png.write(to:URL(fileURLWithPath:args[5]))
        var usage = rusage(); getrusage(RUSAGE_SELF, &usage)
        let report:[String:Any] = ["engine":"WKWebView", "os":ProcessInfo.processInfo.operatingSystemVersionString,
            "result":result, "nativeBridge":"In-memory benchmark recovery/status/autosave only; production native disk/MCP/clipboard costs excluded",
            "memory":["ownerPeakRSSBytes":usage.ru_maxrss, "scope":"This benchmark UI process only; WebKit content/GPU/network process memory is not included"]]
        try JSONSerialization.data(withJSONObject:report, options:[.prettyPrinted,.sortedKeys]).write(to:URL(fileURLWithPath:args[4]))
        print("PASS: fresh visible WKWebView production bundle, \(nodes.count) total / 200 initially visible mixed nodes, normal wheel scheduling, unchanged checkpoint; \(args[4])")
    }
}
