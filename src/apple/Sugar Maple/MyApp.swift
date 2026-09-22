import SwiftUI

@main
struct SugarMapleApp: App {
    @State private var host = EditorHost()
    var body: some Scene {
        Window("Sugar Maple", id: "editor") {
            ContentView(host: host)
                .frame(minWidth: 1000, minHeight: 640)
                .preferredColorScheme(.dark)
        }
        .defaultSize(width: 1440, height: 900)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("New") { host.fileCommand(.new) }
                    .disabled(host.fileCommandInProgress)
                    .keyboardShortcut("n", modifiers: .command)
                Button("Open…") { host.fileCommand(.open) }
                    .disabled(host.fileCommandInProgress)
                    .keyboardShortcut("o", modifiers: .command)
            }
            CommandGroup(replacing: .saveItem) {
                Button("Save") { host.fileCommand(.save) }
                    .disabled(host.fileCommandInProgress)
                    .keyboardShortcut("s", modifiers: .command)
                Button("Save As…") { host.fileCommand(.saveAs) }
                    .disabled(host.fileCommandInProgress)
                    .keyboardShortcut("s", modifiers: [.command, .shift])
            }
        }
    }
}
