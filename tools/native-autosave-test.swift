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
        let packages = FileManager.default.enumerator(at: root.appendingPathComponent("Documents"), includingPropertiesForKeys: nil)!.allObjects.compactMap { $0 as? URL }.filter { $0.pathExtension == "syrup" }
        precondition(Set(packages.map(\.lastPathComponent)) == ["First.syrup", "Second.syrup"])
        try await persistence.save(checkpoint("third", "First")) // Same title, independent document.
        let legacy = root.appendingPathComponent("legacy-hash.syrup")
        try DocumentPackage.write(JSONSerialization.jsonObject(with: checkpoint("legacy", "Readable")), to: legacy)
        try await persistence.adopt(legacy, id: "legacy", fingerprint: DocumentPackage.fingerprint(legacy))
        try await persistence.save(checkpoint("legacy", "Readable"))
        precondition(FileManager.default.fileExists(atPath: root.appendingPathComponent("Readable.syrup").path))
        precondition(!FileManager.default.fileExists(atPath: legacy.path))
        let custom = root.appendingPathComponent("Chosen.syrup")
        try await persistence.save(first, to: custom)
        let reopened = DocumentPersistence(root: root)
        let edited = try checkpoint("first", "Edited after restart")
        let remainsManaged = try await reopened.save(edited)
        precondition(!remainsManaged)
        let renamed = root.appendingPathComponent("Edited after restart.syrup")
        precondition(!FileManager.default.fileExists(atPath: custom.path))
        let loaded = try DocumentPackage.read(renamed)
        // A conflicting title cannot replace another document or remove the original.
        let collision = root.appendingPathComponent("Taken.syrup")
        try DocumentPackage.write(JSONSerialization.jsonObject(with: second), to: collision)
        do {
            try await reopened.save(checkpoint("first", "Taken"))
            fatalError("Rename collision accepted")
        } catch {}
        precondition(FileManager.default.fileExists(atPath: renamed.path))
        let other = try DocumentPackage.read(collision)
        precondition((other["document"] as? [String: Any])?["id"] as? String == "second")
        do {
            try await reopened.save(checkpoint("first", "../Invalid"))
            fatalError("Invalid filename accepted")
        } catch {}
        try await reopened.save(checkpoint("first", "edited after restart"))
        let lowercase = root.appendingPathComponent("edited after restart.syrup")
        precondition(FileManager.default.fileExists(atPath: lowercase.path))
        // Undoing the title change restores the previous filename.
        try await reopened.save(edited)

        precondition((loaded["document"] as? [String: Any])?["name"] as? String == "Edited after restart")
        let external = try JSONSerialization.jsonObject(with: checkpoint("first", "External change"))
        try DocumentPackage.write(external, to: renamed)
        do {
            try await reopened.save(checkpoint("first", "Unwritten edit"))
            fatalError("External file overwritten")
        } catch {}
        let preserved = try DocumentPackage.read(renamed)
        precondition((preserved["document"] as? [String: Any])?["name"] as? String == "External change")
        let recovery = try await reopened.load()!
        let value = try JSONSerialization.jsonObject(with: recovery) as! [String: Any]
        precondition((value["document"] as? [String: Any])?["name"] as? String == "Unwritten edit")
        print("PASS: real autosave packages, independent documents, title rename, collisions, invalid names, case-only rename, rename undo, migration, restart, external conflict and recovery preservation")
    }
}
