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
    }
}
