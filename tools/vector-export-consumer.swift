
import AppKit
import WebKit

private final class VectorNavigation: NSObject, WKNavigationDelegate {
    var loaded = false
    var error: Error?
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { loaded = true }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { self.error = error }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { self.error = error }
}
private struct VectorFixtureRecord: Decodable { let name: String; let width: Double; let height: Double; let svg: String }
@main private struct VectorConsumer {
    @MainActor static func wait(_ predicate: () -> Bool) {
        let deadline = Date().addingTimeInterval(30)
        while !predicate() && Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.01)) }
        precondition(predicate(), "Native vector consumer timed out")
    }
    static func pixels(_ image: CGImage, width: Int, height: Int) -> [UInt8] {
        var bytes = [UInt8](repeating: 255, count: width * height * 4)
        bytes.withUnsafeMutableBytes { buffer in
            let context = CGContext(data: buffer.baseAddress, width: width, height: height, bitsPerComponent: 8,
                bytesPerRow: width * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!,
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
            context.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
            context.fill(CGRect(x: 0, y: 0, width: width, height: height))
            context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        }
        return bytes
    }
    @MainActor static func main() throws {
        let folder = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
        let fixtures = try JSONDecoder().decode([VectorFixtureRecord].self, from: Data(contentsOf: folder.appendingPathComponent("fixtures.json")))
        let views: [AnyView] = [/* GENERATED_VIEWS */]
        NSApplication.shared.setActivationPolicy(.accessory)
        NSApplication.shared.finishLaunching()
        let web = WKWebView(frame: .zero), delegate = VectorNavigation()
        web.navigationDelegate = delegate
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 300, height: 200), styleMask: .borderless, backing: .buffered, defer: false)
        window.contentView = web
        window.orderBack(nil)
        defer { web.stopLoading(); window.orderOut(nil) }
        var reports: [[String: Any]] = []
        for (index, fixture) in fixtures.enumerated() {
            let viewportWidth = ceil(fixture.width), viewportHeight = ceil(fixture.height)
            window.setContentSize(NSSize(width: viewportWidth, height: viewportHeight))
            delegate.loaded = false; delegate.error = nil
            web.loadHTMLString("<html><head><meta name='viewport' content='width=device-width, initial-scale=1'><style>html,body{margin:0;background:white;}svg{display:block}</style></head><body>\(fixture.svg)</body></html>", baseURL: nil)
            wait { delegate.loaded || delegate.error != nil }
            precondition(delegate.error == nil)
            var snapshot: NSImage?, snapshotError: Error?
            let config = WKSnapshotConfiguration()
            config.rect = CGRect(x: 0, y: 0, width: viewportWidth, height: viewportHeight)
            config.snapshotWidth = NSNumber(value: viewportWidth * 2 / window.backingScaleFactor)
            web.takeSnapshot(with: config) { image, error in snapshot = image; snapshotError = error }
            wait { snapshot != nil || snapshotError != nil }
            precondition(snapshotError == nil)
            let reference = snapshot!.cgImage(forProposedRect: nil, context: nil, hints: nil)!
            precondition(reference.width == Int(viewportWidth * 2) && reference.height == Int(viewportHeight * 2), "SVG snapshot must use the declared 2x comparison resolution")
            try NSBitmapImageRep(cgImage: reference).representation(using: .png, properties: [:])!.write(to: folder.appendingPathComponent("\(index)-svg.png"))
            let renderer = ImageRenderer(content: views[index].frame(width: viewportWidth, height: viewportHeight, alignment: .topLeading).background(Color.white))
            renderer.proposedSize = ProposedViewSize(width: viewportWidth, height: viewportHeight)
            // Compare identical backing pixels, rather than resampling only one renderer.
            renderer.scale = CGFloat(reference.width) / viewportWidth
            let native = renderer.cgImage!
            precondition(native.width == reference.width && native.height == reference.height)
            let width = reference.width, height = reference.height
            try NSBitmapImageRep(cgImage: native).representation(using: .png, properties: [:])!.write(to: folder.appendingPathComponent("\(index)-native.png"))
            let a = pixels(native, width: width, height: height), b = pixels(reference, width: width, height: height)
            var nativeInk = 0, svgInk = 0, union = 0, intersection = 0, differences = 0
            for pixel in 0..<(width * height) {
                let offset = pixel * 4
                let inkA = a[offset..<offset+3].min()! < 225, inkB = b[offset..<offset+3].min()! < 225
                if inkA { nativeInk += 1 }; if inkB { svgInk += 1 }
                if inkA || inkB { union += 1 }
                if inkA && inkB { intersection += 1 }
                if (0..<3).map({ abs(Int(a[offset+$0]) - Int(b[offset+$0])) }).max()! > 48 { differences += 1 }
            }
            let overlap = Double(intersection) / Double(max(1, union)), difference = Double(differences) / Double(max(1, union))
            reports.append(["name": fixture.name, "width": width, "height": height, "nativeInk": nativeInk, "svgInk": svgInk,
                "inkIntersectionOverUnion": overlap, "largeColorDifferenceOverInkUnion": difference])
            print("\(fixture.name): native ink \(nativeInk), SVG ink \(svgInk), overlap \(overlap), difference \(difference)")
            try JSONSerialization.data(withJSONObject: reports, options: [.prettyPrinted, .sortedKeys]).write(to: folder.appendingPathComponent("comparison.json"))
            precondition(nativeInk > 0 && svgInk > 0 && overlap >= 0.94 && difference <= 0.1, "Native vector differs from independent SVG renderer: \(fixture.name)")
        }
        print("PASS: \(fixtures.count) standalone SwiftUI vector fixtures compile against macOS 14 and render against actual WKWebView SVG references")
    }
}
