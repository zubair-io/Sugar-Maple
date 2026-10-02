import AppKit

@main struct NativeClipboardTest {
    @MainActor static func main() throws {
        if CommandLine.arguments.count > 1 {
            let data = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
            let plist = try PropertyListSerialization.propertyList(from: data, format: nil) as! [String: Any]
            let declarations = plist["UTExportedTypeDeclarations"] as! [[String: Any]]
            let declaration = declarations.first { $0["UTTypeIdentifier"] as? String == NativeClipboard.editableType.rawValue }
            precondition(declaration?["UTTypeConformsTo"] as? [String] == ["public.json"])
            let documents = plist["CFBundleDocumentTypes"] as! [[String: Any]]
            precondition(!documents.contains { ($0["LSItemContentTypes"] as? [String])?.contains(NativeClipboard.editableType.rawValue) == true })
        }
        // A private named pasteboard never replaces the user's general clipboard.
        let board = NSPasteboard(name: .init("io.zubair.sugarmaple.qa.\(UUID().uuidString)"))
        defer { board.releaseGlobally() }
        func rejected(_ operation: () throws -> Void) {
            do { try operation() } catch { return }
            fatalError("Unexpected clipboard acceptance")
        }
        func expect(_ expected: String) throws {
            let value = try NativeClipboard.read(from: board)
            precondition(value == expected)
        }
        let envelope = "{\"format\":\"sugar-maple-elements\",\"version\":2,\"nodes\":[{\"id\":\"label\",\"text\":\"مرحبا ☕\"}],\"dependencies\":[],\"tokens\":{}}"
        try NativeClipboard.write(envelope, format: "editable", to: board)
        precondition(board.types?.contains(NativeClipboard.editableType) == true)
        precondition(board.string(forType: .string) == envelope)
        let roundTrip = try NativeClipboard.read(from: board)
        precondition(roundTrip == envelope)

        // Native structured data wins over an unrelated text fallback.
        let mixed = NSPasteboardItem()
        mixed.setString("different fallback", forType: .string)
        mixed.setData(Data(envelope.utf8), forType: NativeClipboard.editableType)
        board.clearContents(); precondition(board.writeObjects([mixed]))
        try expect(envelope)
        let revision = board.changeCount
        for bad in ["{}", "null", "not JSON", envelope.replacingOccurrences(of: "\"version\":2", with: "\"version\":true"), envelope.replacingOccurrences(of: "\"version\":2", with: "\"version\":3"), envelope.replacingOccurrences(of: "\"version\":2", with: "\"version\":1.5")] {
            rejected { try NativeClipboard.write(bad, format: "editable", to: board) }
            precondition(board.changeCount == revision)
        }
        rejected { try NativeClipboard.write("text", format: "unknown", to: board) }
        rejected { try NativeClipboard.write(String(repeating: "x", count: NativeClipboard.maximumBytes + 1), to: board) }
        precondition(board.changeCount == revision)

        try NativeClipboard.write("Plain Swift or HTML text", to: board)
        precondition(board.types?.contains(NativeClipboard.editableType) != true)
        try expect("Plain Swift or HTML text")
        // Browser/version-one envelopes remain valid through plain-text exchange.
        let legacy = envelope.replacingOccurrences(of: "\"version\":2", with: "\"version\":1")
        try NativeClipboard.write(legacy, to: board)
        try expect(legacy)
        try NativeClipboard.write(legacy, format: "editable", to: board)
        try expect(legacy)

        for data in [Data([0xff,0xfe]), Data("{}".utf8), Data(repeating: 0, count: NativeClipboard.maximumBytes + 1)] {
            let corrupt = NSPasteboardItem()
            corrupt.setString(envelope, forType: .string)
            corrupt.setData(data, forType: NativeClipboard.editableType)
            board.clearContents(); precondition(board.writeObjects([corrupt]))
            rejected { _ = try NativeClipboard.read(from: board) }
        }
        board.declareTypes([NativeClipboard.editableType], owner: nil)
        precondition(board.types?.contains(NativeClipboard.editableType) == true)
        precondition(board.data(forType: NativeClipboard.editableType) == nil)
        do {
            _ = try NativeClipboard.read(from: board)
            fatalError("Accepted missing structured data")
        } catch NativeClipboard.ClipboardError.invalidEditable { }
        board.clearContents()
        try expect("")
        print("PASS: actual named NSPasteboard structured/text formats, UTF-8 roundtrip, structured precedence, version-one fallback, rejected malformed/future/Boolean/oversize writes preserve content and invalid structured reads reject")
    }
}
