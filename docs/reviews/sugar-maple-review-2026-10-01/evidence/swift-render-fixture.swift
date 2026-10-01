import AppKit
import SwiftUI
@main struct RenderFixture {
  @MainActor static func main() throws {
    _ = NSApplication.shared
    let view = NSHostingView(rootView: SugarMapleView())
    view.frame = NSRect(x: 0, y: 0, width: 393, height: 852)
    view.layoutSubtreeIfNeeded()
    guard let bitmap = view.bitmapImageRepForCachingDisplay(in: view.bounds) else { fatalError("No bitmap") }
    view.cacheDisplay(in: view.bounds, to: bitmap)
    let data = bitmap.representation(using: .png, properties: [:])!
    try data.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
    print("PASS: rendered actual generated SwiftUI in NSHostingView")
  }
}
