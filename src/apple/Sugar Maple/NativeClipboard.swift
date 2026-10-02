import AppKit
import CoreFoundation

/// Transport envelope only. The editor validates the complete scene/dependency
/// closure before producing a paste transaction.
@MainActor enum NativeClipboard {
    static let editableType = NSPasteboard.PasteboardType("io.zubair.sugarmaple.elements")
    static let maximumBytes = 32 * 1024 * 1024
    enum ClipboardError: LocalizedError {
        case invalidFormat, invalidEditable, tooLarge, unavailable
        var errorDescription: String? {
            switch self {
            case .invalidFormat: "Unsupported clipboard format"
            case .invalidEditable: "Clipboard does not contain supported editable Sugar Maple elements"
            case .tooLarge: "Clipboard exceeds the 32 MB transport limit"
            case .unavailable: "Clipboard write failed; try copying again"
            }
        }
    }
    private static func validate(_ text: String, editable: Bool) throws {
        guard text.utf8.count <= maximumBytes else { throw ClipboardError.tooLarge }
        guard editable else { return }
        guard let value = try? JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any],
              value["format"] as? String == "sugar-maple-elements",
              let version = value["version"] as? NSNumber,
              CFGetTypeID(version) != CFBooleanGetTypeID(),
              [1.0, 2.0].contains(version.doubleValue) else { throw ClipboardError.invalidEditable }
    }
    static func write(_ text: String, format: String = "text", to board: NSPasteboard = .general) throws {
        guard ["text", "editable"].contains(format) else { throw ClipboardError.invalidFormat }
        let editable = format == "editable"
        try validate(text, editable: editable)
        let item = NSPasteboardItem()
        guard item.setString(text, forType: .string) else { throw ClipboardError.unavailable }
        if editable, !item.setData(Data(text.utf8), forType: editableType) { throw ClipboardError.unavailable }
        board.clearContents()
        guard board.writeObjects([item]) else { throw ClipboardError.unavailable }
    }
    static func read(from board: NSPasteboard = .general) throws -> String {
        if board.types?.contains(editableType) == true {
            guard let data = board.data(forType: editableType), data.count <= maximumBytes else { throw ClipboardError.tooLarge }
            guard let text = String(data: data, encoding: .utf8) else { throw ClipboardError.invalidEditable }
            try validate(text, editable: true)
            return text
        }
        let text = board.string(forType: .string) ?? ""
        try validate(text, editable: false)
        return text
    }
}
