import AppKit
import SwiftUI
import CoreFoundation
import Darwin

private let maxPacket = 262144
private enum Invalid: Error { case packet }
@MainActor private final class Model: ObservableObject {
    @Published var label = "Save & Continue"
    @Published var value = "consumer@example.test"
    @Published var inputLabel = "Email"
    @Published var placeholder = "Your email"
    @Published var inputType = "email"
    @Published var disabled = false
    @Published var inputDisabled = false
    @Published var padding: Double = 24
    var revision = -1
    var emit: ([String: Any]) -> Void = { _ in }
}
private struct Fixture: View {
    @ObservedObject var model: Model
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Pinned library consumer")
            Text(model.inputLabel)
            Group {
                if model.inputType == "password" {
                    SecureField(model.placeholder, text: value)
                } else {
                    TextField(model.placeholder, text: value)
                }
            }.accessibilityLabel(model.inputLabel).disabled(model.inputDisabled)
            Button(model.label) {
                model.emit(["kind": "action", "component": "Button", "revision": model.revision])
            }.disabled(model.disabled)
        }.padding(model.padding).frame(width: 360, alignment: .leading)
            .frame(width: 400, height: 500, alignment: .topLeading)
            .background(Color.white).environment(\.colorScheme, .light)
    }
    private var value: Binding<String> {
        Binding(get: { model.value }, set: { value in
            guard value.utf16.count <= 20000, !model.inputDisabled, value != model.value else { return }
            model.value = value
            model.emit(["kind": "change", "component": "Input", "revision": model.revision, "value": value])
        })
    }
}
@main private struct Helper {
    @MainActor static func main() {
        guard CommandLine.arguments.count == 2,
              UUID(uuidString: CommandLine.arguments[1]) != nil else { exit(64) }
        let session = CommandLine.arguments[1]
        let app = NSApplication.shared
        app.setActivationPolicy(.accessory)
        app.finishLaunching()
        let menu = NSMenu(), edit = NSMenuItem(title: "Edit", action: nil, keyEquivalent: "")
        edit.submenu = NSMenu(title: "Edit")
        edit.submenu?.addItem(NSMenuItem(title: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a"))
        menu.addItem(edit); app.mainMenu = menu
        let model = Model()
        func send(_ event: [String: Any]) {
            var packet = event; packet["version"] = 1; packet["session"] = session
            guard let data = try? JSONSerialization.data(withJSONObject: packet, options: [.sortedKeys]),
                  data.count < 4000000 else { exit(65) }
            FileHandle.standardOutput.write(data + Data([10]))
        }
        model.emit = send
        let host = NSHostingView(rootView: Fixture(model: model))
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 400, height: 500),
                              styleMask: [.titled, .closable], backing: .buffered, defer: false)
        window.title = "Sugar Maple — Trusted Native Preview Fixture"
        window.contentView = host
        window.isReleasedWhenClosed = false
        window.orderFrontRegardless()
        // This canary is a test-owned file, never a path supplied in the protocol.
        let canary = ProcessInfo.processInfo.environment["MAPLE_PREVIEW_TEST_CANARY"]
        let canaryDenied = canary.map { (try? Data(contentsOf: URL(fileURLWithPath: $0))) == nil }
        var networkDenied: Bool? = nil
        if let portText = ProcessInfo.processInfo.environment["MAPLE_PREVIEW_TEST_PORT"], let port = UInt16(portText), port > 0 {
            let fd = socket(AF_INET, SOCK_STREAM, 0)
            if fd < 0 { networkDenied = errno == EPERM || errno == EACCES }
            else {
                var address = sockaddr_in()
                address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
                address.sin_family = sa_family_t(AF_INET)
                address.sin_port = port.bigEndian
                address.sin_addr = in_addr(s_addr: inet_addr("127.0.0.1"))
                let status = withUnsafePointer(to: &address) { pointer in
                    pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { connect(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) }
                }
                networkDenied = status < 0 && (errno == EPERM || errno == EACCES)
                close(fd)
            }
        }
        send(["kind": "ready", "canaryDenied": canaryDenied as Any? ?? NSNull(), "networkDenied": networkDenied as Any? ?? NSNull()])
        func string(_ packet: [String: Any], _ key: String, _ maximum: Int) throws -> String {
            guard let value = packet[key] as? String, value.utf16.count <= maximum else { throw Invalid.packet }
            return value
        }
        func boolean(_ packet: [String: Any], _ key: String) throws -> Bool {
            guard let value = packet[key] as? NSNumber,
                  CFGetTypeID(value) == CFBooleanGetTypeID() else { throw Invalid.packet }
            return value.boolValue
        }
        func number(_ packet: [String: Any], _ key: String, _ maximum: Double) throws -> Double {
            guard let value = packet[key] as? NSNumber, CFGetTypeID(value) != CFBooleanGetTypeID(),
                  value.doubleValue.isFinite, value.doubleValue >= 0, value.doubleValue <= maximum else { throw Invalid.packet }
            return value.doubleValue
        }
        func receive(_ data: Data) {
            var revision = max(0, model.revision)
            do {
                guard data.count <= maxPacket,
                      let packet = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                      Set(packet.keys) == Set(["version", "session", "revision", "kind", "label", "inputLabel", "value", "placeholder", "inputType", "disabled", "inputDisabled", "padding"]),
                      try number(packet, "version", 1) == 1,
                      try string(packet, "session", 80) == session,
                      try string(packet, "kind", 10) == "render" else { throw Invalid.packet }
                let next = try number(packet, "revision", 2147483647)
                guard next.rounded() == next else { throw Invalid.packet }
                revision = Int(next)
                guard revision > model.revision else {
                    send(["kind": "error", "revision": revision, "code": "stale_revision"]); return
                }
                let label = try string(packet, "label", 20000), value = try string(packet, "value", 20000),
                    inputLabel = try string(packet, "inputLabel", 200), placeholder = try string(packet, "placeholder", 20000),
                    inputType = try string(packet, "inputType", 20), disabled = try boolean(packet, "disabled"),
                    inputDisabled = try boolean(packet, "inputDisabled"), padding = try number(packet, "padding", 100)
                guard ["text", "email", "password"].contains(inputType),
                      !value.contains("\n"), !value.contains("\r") else { throw Invalid.packet }
                // All props are validated before any published state is changed.
                model.revision = revision; model.label = label; model.value = value; model.inputLabel = inputLabel
                model.placeholder = placeholder; model.inputType = inputType; model.disabled = disabled
                model.inputDisabled = inputDisabled; model.padding = padding
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                    guard model.revision == revision else { return }
                    host.layoutSubtreeIfNeeded()
                    guard let bitmap = host.bitmapImageRepForCachingDisplay(in: host.bounds) else { exit(66) }
                    host.cacheDisplay(in: host.bounds, to: bitmap)
                    guard let png = bitmap.representation(using: .png, properties: [:]) else { exit(66) }
                    send(["kind": "rendered", "revision": revision, "width": bitmap.pixelsWide,
                          "height": bitmap.pixelsHigh, "png": png.base64EncodedString()])
                }
            } catch { send(["kind": "error", "revision": revision, "code": "invalid_props"]) }
        }
        DispatchQueue.global(qos: .userInitiated).async {
            var buffer = Data()
            while true {
                let chunk = FileHandle.standardInput.availableData
                if chunk.isEmpty { DispatchQueue.main.async { app.terminate(nil) }; return }
                for byte in chunk {
                    if byte == 10 {
                        let packet = buffer; buffer.removeAll(keepingCapacity: true)
                        DispatchQueue.main.async { receive(packet) }
                    } else {
                        buffer.append(byte)
                        if buffer.count > maxPacket { exit(65) }
                    }
                }
            }
        }
        app.run()
    }
}
