import AppKit
import WebKit

@main struct PreviewTest {
    @MainActor static func main() async throws {
        guard CommandLine.arguments.count == 3 else { fatalError("Pass bundle resources and fixture") }
        NSApplication.shared.setActivationPolicy(.accessory)
        NSApplication.shared.finishLaunching()
        let resources = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
        var value = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[2]))) as! [String: Any]
        var closeCount = 0, diagnostic = ""
        let owner = NSWindow(contentRect: NSRect(x:0,y:0,width:800,height:600), styleMask:[.titled], backing:.buffered, defer:false)
        owner.isReleasedWhenClosed = false
        let preview = try PreviewWindow(value: value, resources: resources, owner: owner) { error in closeCount += 1; diagnostic = error }
        func evaluate(_ code: String) async throws -> Any { try await preview.webView.evaluateJavaScript(code) ?? NSNull() }
        func verify(_ code: String) async throws { let result = try await evaluate(code); precondition(result as? Bool == true, code) }
        func wait(_ code: String) async throws {
            for _ in 0..<500 {
                if preview.closed { fatalError("Preview closed unexpectedly: \(diagnostic)") }
                if (try? await evaluate(code)) as? Bool == true { return }
                try await Task.sleep(for: .milliseconds(20))
            }
            let text = try? await evaluate("document.body.innerText")
            fatalError("Preview condition did not settle: \(code) \(String(describing:text))")
        }
        NSApplication.shared.activate(ignoringOtherApps:true)
        try await wait("!!document.querySelector('[data-node-id=login]')")
        precondition(!preview.webView.configuration.websiteDataStore.isPersistent)
        try await verify("typeof window.sugarMaple === 'undefined' && !window.webkit.messageHandlers.native && !!window.webkit.messageHandlers.preview")
        let denied = try await preview.webView.callAsyncJavaScript("try { await window.webkit.messageHandlers.preview.postMessage({action:'file.open'}); return false; } catch { return true; }", arguments:[:], in:nil, contentWorld:.page)
        precondition(denied as? Bool == true)
        let networkDenied = try await preview.webView.callAsyncJavaScript("""
            return await new Promise(resolve => {
              const done=value=>{clearTimeout(timer);document.removeEventListener('securitypolicyviolation',listener);resolve(value)};
              const listener=event=>{if(event.violatedDirective==='connect-src'&&event.blockedURI.startsWith('https://example.test/'))done(true)};
              const timer=setTimeout(()=>done(false),1000);
              document.addEventListener('securitypolicyviolation',listener);
              fetch('https://example.test/preview-must-not-connect').catch(()=>{});
            });
            """, arguments:[:], in:nil, contentWorld:.page)
        precondition(networkDenied as? Bool == true)
        _ = try await evaluate("document.querySelector('[data-node-id=email] input').value='RuntimeOnly'; document.querySelector('[data-node-id=email] input').dispatchEvent(new Event('input',{bubbles:true}));")
        var doc = value["document"] as! [String:Any], nodes = doc["nodes"] as! [[String:Any]]
        let index = nodes.firstIndex(where:{$0["id"] as? String == "go"})!
        nodes[index]["text"] = "Continue live"; doc["nodes"] = nodes; value["document"] = doc; value["revision"] = 1
        try preview.update(value)
        try await wait("document.querySelector('[data-node-id=go] button')?.textContent === 'Continue live'")
        try await verify("document.querySelector('[data-node-id=email] input').value === 'RuntimeOnly'")
        _ = try await evaluate("document.querySelector('[data-node-id=open] button').click()")
        try await wait("!!document.querySelector('.overlay-dialog')")
        _ = try await evaluate("document.querySelector('[data-node-id=close] button').click()")
        try await wait("!document.querySelector('.overlay-dialog')")
        _ = try await evaluate("document.querySelector('[data-node-id=go] button').click()")
        try await wait("!!document.querySelector('[data-node-id=welcome]')")
        _ = try await evaluate("[...document.querySelectorAll('header button')].find(n=>n.textContent==='Back').click()")
        try await wait("!!document.querySelector('[data-node-id=login]')")
        _ = try await evaluate("[...document.querySelectorAll('header button')].find(n=>n.textContent==='Reset preview').click()")
        try await wait("document.querySelector('[data-node-id=email] input')?.value === 'mock@example.test'")
        _ = try await evaluate("location.href='file:///etc/passwd'")
        try await Task.sleep(for:.milliseconds(100))
        precondition(preview.webView.url?.host == "preview")
        preview.close(); preview.close()
        precondition(preview.closed && closeCount == 1 && diagnostic.isEmpty)
        precondition(preview.webView.navigationDelegate == nil)
        try await Task.sleep(for:.milliseconds(100))
        try await verify("typeof window.sugarMaplePreview === 'undefined'")
        print("PASS: actual isolated WKWebView, offline bundled fonts, no authoring bridge/store, rejected file command/navigation, live scene with retained ephemeral input, overlays/navigation/reset, idempotent close and disposed renderer")
        let child = try PreviewWindow(value:value,resources:resources,owner:owner) { _ in closeCount += 1 }
        owner.close()
        try await Task.sleep(for:.milliseconds(100))
        precondition(child.closed && closeCount == 2)
        var detached: PreviewWindow? = try PreviewWindow(value:value,resources:resources,owner:nil) { _ in }
        weak var released = detached
        detached?.close(); detached = nil
        try await Task.sleep(for:.milliseconds(200))
        precondition(released == nil, "Preview retained after close")
    }
}
