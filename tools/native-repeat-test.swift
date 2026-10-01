import AppKit
import WebKit

@main struct RepeatTest {
    @MainActor static func main() async throws {
        precondition(CommandLine.arguments.count == 4)
        let input = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[2]))) as! [String:Any]
        let checkpoint = input["checkpoint"] as! [String:Any]
        let package = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString).appendingPathExtension("syrup")
        defer { try? FileManager.default.removeItem(at: package) }
        try DocumentPackage.write(checkpoint, to: package)
        let reopened = try DocumentPackage.read(package)
        precondition(NSDictionary(dictionary: reopened).isEqual(to: checkpoint))
        try JSONSerialization.data(withJSONObject: reopened).write(to: URL(fileURLWithPath: CommandLine.arguments[3]), options: .atomic)
        let document = reopened["document"] as! [String:Any]
        let assets = document["assets"] as! [String:String]
        precondition(assets.count == 1)
        let source = assets.values.first!
        let bytes = Data(base64Encoded: String(source.split(separator:",")[1]))!
        let image = NSImage(data: bytes)!
        precondition(image.size.width == 1 && image.size.height == 1)
        NSApplication.shared.setActivationPolicy(.accessory)
        NSApplication.shared.finishLaunching()
        let owner = NSWindow(contentRect:NSRect(x:0,y:0,width:800,height:600),styleMask:[.titled],backing:.buffered,defer:false)
        owner.isReleasedWhenClosed = false
        let value:[String:Any] = ["version":1,"documentId":document["id"]!,"revision":3,"rootId":"board","document":document]
        let preview = try PreviewWindow(value:value,resources:URL(fileURLWithPath:CommandLine.arguments[1]),owner:owner){ _ in }
        NSApplication.shared.activate(ignoringOtherApps:true)
        for _ in 0..<500 {
            if (try? await preview.webView.evaluateJavaScript("document.querySelectorAll('img').length === 2 && [...document.querySelectorAll('img')].every(image => image.naturalWidth === 1)")) as? Bool == true { break }
            try await Task.sleep(for:.milliseconds(20))
        }
        let rendered = try await preview.webView.evaluateJavaScript("document.querySelectorAll('img').length === 2 && [...document.querySelectorAll('img')].every(image => image.naturalWidth === 1) && document.querySelector('[data-node-id=title]').textContent.trim() === 'First' && document.querySelector('input').value === 'first@example.test'")
        precondition(rendered as? Bool == true)
        preview.close()
        owner.close()
        print("PASS: actual .syrup save/reopen retains one shared image and complete journal; native NSImage decodes embedded bytes; isolated bundled WKWebView renders two imported images/text/input values")
    }
}
