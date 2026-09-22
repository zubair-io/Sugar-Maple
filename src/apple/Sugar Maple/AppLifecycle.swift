import AppKit
import WebKit

@MainActor
final class AppLifecycle: NSObject, NSApplicationDelegate {
    weak var host: EditorHost?
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard let host else { return .terminateNow }
        Task { @MainActor in
            do {
                _ = try await host.webView.callAsyncJavaScript(
                    "if (window.sugarMaple?.ready) await window.sugarMaple.flushAutosave(); return true;",
                    arguments: [:], in: nil, contentWorld: .page
                )
                sender.reply(toApplicationShouldTerminate: true)
            } catch {
                let alert = NSAlert()
                alert.messageText = "Your latest changes have not been saved"
                alert.informativeText = "Sugar Maple will stay open. Retry Save or use Save As before quitting."
                alert.addButton(withTitle: "Keep Open")
                if let window = host.webView.window { await alert.beginSheetModal(for: window) }
                sender.reply(toApplicationShouldTerminate: false)
            }
        }
        return .terminateLater
    }
}
