import Foundation

@main struct AutosaveTest {
    static func checkpoint(_ id: String, _ name: String) throws -> Data {
        try JSONSerialization.data(withJSONObject: ["document": ["version": 1, "id": id, "name": name,
            "pages": [["id": "page", "name": "Page 1", "order": 0]], "nodes": []]])
    }
    static func main() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let persistence = DocumentPersistence(root: root)
        let first = try checkpoint("first", "First"), second = try checkpoint("second", "Second")
        let managed = try await persistence.save(first)
        precondition(managed)
        try await persistence.save(second)
        let packages = try FileManager.default.contentsOfDirectory(at: root.appendingPathComponent("Documents"), includingPropertiesForKeys: nil).filter { $0.pathExtension == "syrup" }
        precondition(packages.count == 2)
        let custom = root.appendingPathComponent("Chosen.syrup")
        try await persistence.save(first, to: custom)
        let reopened = DocumentPersistence(root: root)
        let edited = try checkpoint("first", "Edited after restart")
        let remainsManaged = try await reopened.save(edited)
        precondition(!remainsManaged)
        let loaded = try DocumentPackage.read(custom)
        precondition((loaded["document"] as? [String: Any])?["name"] as? String == "Edited after restart")
        let external = try JSONSerialization.jsonObject(with: checkpoint("first", "External change"))
        try DocumentPackage.write(external, to: custom)
        do {
            try await reopened.save(checkpoint("first", "Unwritten edit"))
            fatalError("External file overwritten")
        } catch {}
        let preserved = try DocumentPackage.read(custom)
        precondition((preserved["document"] as? [String: Any])?["name"] as? String == "External change")
        let recovery = try await reopened.load()!
        let value = try JSONSerialization.jsonObject(with: recovery) as! [String: Any]
        precondition((value["document"] as? [String: Any])?["name"] as? String == "Unwritten edit")
        print("PASS: real autosave packages, independent documents, chosen-path restart, external conflict and recovery preservation")
    }
}
