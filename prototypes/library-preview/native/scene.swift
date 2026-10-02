import AppKit
import SwiftUI
import CoreFoundation

enum SceneInvalid: Error { case packet, unsupported(String) }

// These checks run inside the sandbox as well as in the TypeScript caller. The
// pinned mapping below is generated from the editor's metadata at build time.
enum SceneRead {
    static func object(_ value: Any?, _ keys: Set<String>) throws -> [String: Any] {
        guard let value = value as? [String: Any], Set(value.keys) == keys else { throw SceneInvalid.packet }
        return value
    }
    static func string(_ value: Any?, _ maximum: Int, _ minimum: Int = 0) throws -> String {
        guard let value = value as? String, value.utf16.count >= minimum, value.utf16.count <= maximum else { throw SceneInvalid.packet }
        return value
    }
    static func choice(_ value: Any?, _ choices: [String]) throws -> String {
        let text = try string(value, 200)
        guard choices.contains(text) else { throw SceneInvalid.packet }
        return text
    }
    static func number(_ value: Any?, _ minimum: Double, _ maximum: Double) throws -> Double {
        guard let value = value as? NSNumber, CFGetTypeID(value) != CFBooleanGetTypeID(),
              value.doubleValue.isFinite, value.doubleValue >= minimum, value.doubleValue <= maximum else { throw SceneInvalid.packet }
        return value.doubleValue
    }
    static func integer(_ value: Any?) throws -> Int {
        let value = try number(value, 0, 2147483647)
        guard value.rounded() == value else { throw SceneInvalid.packet }
        return Int(value)
    }
    static func bool(_ value: Any?) throws -> Bool {
        guard let value = value as? NSNumber, CFGetTypeID(value) == CFBooleanGetTypeID() else { throw SceneInvalid.packet }
        return value.boolValue
    }
    static func color(_ value: Any?) throws -> String {
        let value = try string(value, 7)
        guard value.range(of: "^#[0-9a-fA-F]{6}$", options: .regularExpression) != nil else { throw SceneInvalid.packet }
        return value
    }
}
struct ScenePaint {
    let fill: String, fillEnabled: Bool, color: String, stroke: String
    let strokeWidth: Double, radius: Double, opacity: Double, fontSize: Double, fontWeight: Double
    let fontFamily: String, letterSpacing: Double, textAlign: String
    init(_ value: Any?) throws {
        let p = try SceneRead.object(value, ["fill", "fillEnabled", "color", "stroke", "strokeWidth", "radius", "opacity", "padding", "gap", "fontSize", "fontWeight", "fontFamily", "lineHeight", "letterSpacing", "textAlign"])
        fill = try SceneRead.color(p["fill"]); color = try SceneRead.color(p["color"]); stroke = try SceneRead.color(p["stroke"])
        fillEnabled = try SceneRead.bool(p["fillEnabled"])
        strokeWidth = try SceneRead.number(p["strokeWidth"], 0, 50); radius = try SceneRead.number(p["radius"], 0, 500)
        opacity = try SceneRead.number(p["opacity"], 0, 1); fontSize = try SceneRead.number(p["fontSize"], 6, 500)
        fontWeight = try SceneRead.number(p["fontWeight"], 100, 900)
        fontFamily = try SceneRead.choice(p["fontFamily"], ["system-ui", "sans-serif", "serif", "monospace"])
        letterSpacing = try SceneRead.number(p["letterSpacing"], -20, 100)
        textAlign = try SceneRead.choice(p["textAlign"], ["auto", "left", "center", "right"])
        _ = try SceneRead.number(p["padding"], 0, 1000); _ = try SceneRead.number(p["gap"], 0, 1000)
        _ = try SceneRead.number(p["lineHeight"], 0.5, 5)
    }
    var font: Font {
        let design: Font.Design = fontFamily == "serif" ? .serif : fontFamily == "monospace" ? .monospaced : .default
        let weight: Font.Weight = fontWeight >= 800 ? .heavy : fontWeight >= 700 ? .bold : fontWeight >= 600 ? .semibold : fontWeight >= 500 ? .medium : fontWeight <= 200 ? .ultraLight : fontWeight <= 300 ? .light : .regular
        return .system(size: fontSize, weight: weight, design: design)
    }
    var alignment: Alignment { textAlign == "center" ? .center : textAlign == "right" ? .trailing : .leading }
}
struct SceneNode: Identifiable {
    let id: String, parentId: String?, kind: String, slot: String
    let x: Double, y: Double, width: Double, height: Double, rotation: Double
    let text: String, value: String, label: String, disabled: Bool, inputType: String
    let paint: ScenePaint, component: String?, overrides: Set<String>
    init(_ value: Any?) throws {
        let n = try SceneRead.object(value, ["id", "parentId", "kind", "slot", "x", "y", "width", "height", "rotation", "text", "value", "label", "disabled", "inputType", "style", "library"])
        id = try SceneRead.string(n["id"], 128, 1)
        parentId = n["parentId"] is NSNull ? nil : try SceneRead.string(n["parentId"], 128, 1)
        kind = try SceneRead.choice(n["kind"], ["frame", "text", "button", "input"])
        slot = try SceneRead.choice(n["slot"], ["", "header", "footer"])
        x = try SceneRead.number(n["x"], -10000, 10000); y = try SceneRead.number(n["y"], -10000, 10000)
        width = try SceneRead.number(n["width"], 1, 1600); height = try SceneRead.number(n["height"], 1, 2000)
        rotation = try SceneRead.number(n["rotation"], -10000, 10000)
        text = try SceneRead.string(n["text"], 20000); self.value = try SceneRead.string(n["value"], 20000)
        guard !self.value.contains("\r"), !self.value.contains("\n") else { throw SceneInvalid.packet }
        label = try SceneRead.string(n["label"], 200); disabled = try SceneRead.bool(n["disabled"])
        inputType = try SceneRead.choice(n["inputType"], ["text", "email", "password"])
        paint = try ScenePaint(n["style"])
        let style = n["style"] as! [String: Any]
        if kind != "frame" {
            guard !text.contains("\n"), !text.contains("\r") else { throw SceneInvalid.unsupported("\(id): native multiline text is unsupported; use semantic preview") }
            guard (style["lineHeight"] as! NSObject).isEqual(nativeSceneStyleSupport["lineHeight"] as! NSObject) else { throw SceneInvalid.unsupported("\(id): native lineHeight is unsupported; use semantic preview") }
        }
        if kind == "input" {
            for (key, expected) in nativeSceneStyleSupport["input"] as! [String: Any] {
                guard (style[key] as! NSObject).isEqual(expected as! NSObject) else { throw SceneInvalid.unsupported("\(id): native Input style \(key) is unsupported; use semantic preview") }
            }
        }
        if n["library"] is NSNull { component = nil; overrides = [] }
        else {
            let ref = try SceneRead.object(n["library"], ["component", "variant", "props", "localOverrides", "tokens"])
            let name = try SceneRead.choice(ref["component"], ["Button", "Input", "Card"])
            guard let metadata = nativeSceneMapping[name] as? [String: Any],
                  metadata["semanticKind"] as? String == kind,
                  let supported = metadata["supportedVariants"] as? [String],
                  let variants = metadata["variants"] as? [String],
                  let definitions = metadata["props"] as? [String: [String: Any]],
                  let props = ref["props"] as? [String: Any], Set(props.keys) == Set(definitions.keys),
                  let local = ref["localOverrides"] as? [String], local.count <= 20, Set(local).count == local.count,
                  local.allSatisfy({ ["text", "initialValue", "accessibleLabel", "disabled", "inputType", "fill", "color", "radius", "padding", "gap", "fontSize"].contains($0) }),
                  let tokens = ref["tokens"] as? [String: Any], Set(tokens.keys).isSubset(of: ["--wa-color-brand-fill-loud"]) else { throw SceneInvalid.packet }
            let variant = try SceneRead.choice(ref["variant"], variants)
            guard supported.contains(variant) else { throw SceneInvalid.unsupported("\(id): native \(name) variant \(variant) is unsupported; use semantic preview") }
            var semantics: [String: Any] = ["text": text, "initialValue": self.value, "accessibleLabel": label, "disabled": disabled, "inputType": inputType]
            for (key, v) in n["style"] as! [String: Any] { semantics[key] = v }
            for (key, definition) in definitions {
                let v = props[key]
                switch definition["type"] as? String {
                case "string": _ = try SceneRead.string(v, definition["maxLength"] as! Int)
                case "boolean": _ = try SceneRead.bool(v)
                case "number": _ = try SceneRead.number(v, (definition["min"] as! NSNumber).doubleValue, (definition["max"] as! NSNumber).doubleValue)
                case "enum": _ = try SceneRead.choice(v, definition["values"] as! [String])
                default: throw SceneInvalid.packet
                }
                if let semantic = definition["semantic"] as? String {
                    guard let a = v as? NSObject, let b = semantics[semantic] as? NSObject, a.isEqual(b) else { throw SceneInvalid.packet }
                } else {
                    guard let a = v as? NSObject, let b = definition["default"] as? NSObject, a.isEqual(b) else { throw SceneInvalid.unsupported("\(id): native \(name) property \(key) is unsupported; use semantic preview") }
                }
            }
            for token in tokens.values {
                let t = try SceneRead.object(token, ["name", "value"])
                let name = try SceneRead.string(t["name"], 128, 1)
                guard name.range(of: "^[A-Za-z0-9_.-]+$", options: .regularExpression) != nil else { throw SceneInvalid.packet }
                _ = try SceneRead.color(t["value"])
            }
            component = name; overrides = Set(local)
        }
    }
}
struct NativeScene {
    let documentId: String, sourceRevision: Int, rootId: String, width: Double, height: Double, nodes: [SceneNode]
    init(_ value: Any?) throws {
        let s = try SceneRead.object(value, ["documentId", "sourceRevision", "rootId", "width", "height", "elements"])
        documentId = try SceneRead.string(s["documentId"], 128, 1); sourceRevision = try SceneRead.integer(s["sourceRevision"])
        rootId = try SceneRead.string(s["rootId"], 128, 1)
        width = try SceneRead.number(s["width"], 1, 1600); height = try SceneRead.number(s["height"], 1, 2000)
        guard let elements = s["elements"] as? [Any], (1...100).contains(elements.count) else { throw SceneInvalid.packet }
        nodes = try elements.map { try SceneNode($0) }
        var seen: [String: SceneNode] = [:]
        for (index, n) in nodes.enumerated() {
            guard seen[n.id] == nil else { throw SceneInvalid.packet }
            if index == 0 {
                guard n.id == rootId, n.parentId == nil, n.kind == "frame", n.x == 0, n.y == 0,
                      n.rotation == 0, n.slot == "", n.width == width, n.height == height else { throw SceneInvalid.packet }
            } else {
                guard let parentId = n.parentId, let parent = seen[parentId], parent.kind == "frame",
                      n.slot == "" || parent.component == "Card" else { throw SceneInvalid.packet }
            }
            seen[n.id] = n
        }
    }
}
@MainActor final class NativeSceneModel: ObservableObject {
    @Published var scene: NativeScene?
    @Published var values: [String: String] = [:]
    var revision = -1
    var settledRevision = -1
    var boxes: [String: CGRect] = [:]
    var emit: ([String: Any]) -> Void = { _ in }
    func apply(_ next: NativeScene, revision: Int, reset: Bool) throws {
        if let old = scene, old.documentId == next.documentId, next.sourceRevision < old.sourceRevision { throw SceneInvalid.packet }
        let previous = Dictionary(uniqueKeysWithValues: (scene?.nodes ?? []).map { ($0.id, $0) })
        let clear = reset || scene?.documentId != next.documentId
        var updated: [String: String] = [:]
        for n in next.nodes where n.kind == "input" {
            updated[n.id] = !clear && previous[n.id]?.kind == "input" && previous[n.id]?.value == n.value ? values[n.id] ?? n.value : n.value
        }
        self.revision = revision
        settledRevision = -1
        let ids = Set(next.nodes.map(\.id))
        boxes = boxes.filter { ids.contains($0.key) }; values = updated; scene = next
    }
    func binding(_ id: String) -> Binding<String> {
        Binding(get: { self.values[id] ?? "" }, set: { value in
            guard let n = self.scene?.nodes.first(where: { $0.id == id }), n.kind == "input", !n.disabled,
                  self.settledRevision == self.revision,
                  value.utf16.count <= 20000, !value.contains("\r"), !value.contains("\n"), value != self.values[id] else { return }
            self.values[id] = value
            self.emit(["version": 2, "kind": "change", "revision": self.revision, "nodeId": id, "value": value])
        })
    }
}
private struct SceneBoxes: PreferenceKey {
    static var defaultValue: [String: CGRect] = [:]
    static func reduce(value: inout [String: CGRect], nextValue: () -> [String: CGRect]) { value.merge(nextValue(), uniquingKeysWith: { _, b in b }) }
}
private func sceneColor(_ hex: String) -> Color {
    let rgb = UInt32(hex.dropFirst(), radix: 16)!
    return Color(red: Double((rgb >> 16) & 255) / 255, green: Double((rgb >> 8) & 255) / 255, blue: Double(rgb & 255) / 255)
}
private struct NativeSceneNode: View {
    @ObservedObject var model: NativeSceneModel
    let node: SceneNode
    var body: some View {
        content.frame(width: ceil(node.width), height: ceil(node.height), alignment: node.kind == "frame" ? .topLeading : node.paint.alignment)
            .background(node.kind == "frame" && node.paint.fillEnabled ? sceneColor(node.paint.fill) : .clear, in: RoundedRectangle(cornerRadius: node.paint.radius))
            .overlay { if node.kind == "frame" { RoundedRectangle(cornerRadius: node.paint.radius).strokeBorder(sceneColor(node.paint.stroke), lineWidth: node.paint.strokeWidth) } }
            .font(node.paint.font).foregroundStyle(sceneColor(node.paint.color)).opacity(node.paint.opacity)
            .background(GeometryReader { geometry in Color.clear.preference(key: SceneBoxes.self, value: [node.id: geometry.frame(in: .named("authored-scene"))]) })
            .scaleEffect(x: node.width / ceil(node.width), y: node.height / ceil(node.height), anchor: .topLeading)
            .rotationEffect(.degrees(node.rotation), anchor: UnitPoint(x: node.width / (2 * ceil(node.width)), y: node.height / (2 * ceil(node.height))))
    }
    @ViewBuilder private var content: some View {
        switch node.kind {
        case "frame":
            ZStack(alignment: .topLeading) {
                Color.clear
                ForEach(model.scene?.nodes.filter { $0.parentId == node.id } ?? []) { child in
                    NativeSceneNode(model: model, node: child)
                        .scaleEffect(x: ceil(node.width) / node.width, y: ceil(node.height) / node.height, anchor: .topLeading)
                        .transformEffect(CGAffineTransform(translationX: child.x * ceil(node.width) / node.width, y: child.y * ceil(node.height) / node.height))
                }
            }
        case "text": Text(node.text).kerning(node.paint.letterSpacing).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: node.paint.alignment)
        case "button":
            if node.component != nil && node.overrides.intersection(["fill", "color", "radius"]).isEmpty && node.paint.strokeWidth == 0 {
                button.buttonStyle(.bordered)
            } else {
                button.buttonStyle(.plain).background(node.paint.fillEnabled ? sceneColor(node.paint.fill) : .clear, in: RoundedRectangle(cornerRadius: node.paint.radius))
                    .overlay { RoundedRectangle(cornerRadius: node.paint.radius).strokeBorder(sceneColor(node.paint.stroke), lineWidth: node.paint.strokeWidth) }
            }
        case "input":
            Group {
                if node.inputType == "password" { SecureField(node.text, text: model.binding(node.id)).frame(maxWidth: .infinity, maxHeight: .infinity) }
                else { TextField(node.text, text: model.binding(node.id)).frame(maxWidth: .infinity, maxHeight: .infinity) }
            }.textFieldStyle(.roundedBorder).multilineTextAlignment(node.paint.textAlign == "center" ? .center : node.paint.textAlign == "right" ? .trailing : .leading)
                .accessibilityLabel(node.label).disabled(node.disabled)
        default: EmptyView()
        }
    }
    private var button: some View {
        Button {
            guard let current = model.scene?.nodes.first(where: { $0.id == node.id }), !current.disabled,
                  model.settledRevision == model.revision else { return }
            model.emit(["version": 2, "kind": "action", "revision": model.revision, "nodeId": node.id])
        } label: { Text(node.text).kerning(node.paint.letterSpacing).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: node.paint.textAlign == "auto" ? .center : node.paint.alignment) }
            .accessibilityLabel(node.label.isEmpty ? node.text : node.label).disabled(node.disabled)
    }
}
struct NativeSceneView: View {
    @ObservedObject var model: NativeSceneModel
    var body: some View {
        Group {
            if let scene = model.scene, let root = scene.nodes.first {
                NativeSceneNode(model: model, node: root).frame(width: scene.width, height: scene.height, alignment: .topLeading)
            }
        }.coordinateSpace(name: "authored-scene").environment(\.colorScheme, .light)
            .onPreferenceChange(SceneBoxes.self) { model.boxes = $0 }
    }
}
