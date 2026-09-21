import Foundation

@main struct PersistenceTest {
    static func main() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString).appendingPathExtension("syrup")
        defer { try? FileManager.default.removeItem(at: root) }
        let checkpoint: [String: Any] = ["document": ["version":1,"id":"test","name":"Round trip","pages":[["id":"page","name":"Page 1","order":0]],"nodes":[]], "crdt":[1,2,3]]
        try DocumentPackage.write(checkpoint, to: root)
        let loaded = try DocumentPackage.read(root)
        precondition(NSDictionary(dictionary: checkpoint).isEqual(to: loaded))
        do { try DocumentPackage.write(["document":["version":99]], to:root); fatalError("Invalid checkpoint accepted") } catch {}
        let preserved = try DocumentPackage.read(root)
        precondition(NSDictionary(dictionary: checkpoint).isEqual(to: preserved))
        let fingerprint = try DocumentPackage.fingerprint(root)
        var external = checkpoint
        external["external"] = true
        try DocumentPackage.write(external, to: root)
        do { try DocumentPackage.write(checkpoint, to: root, expectedFingerprint: fingerprint); fatalError("External edit overwritten") } catch {}
        let latest = try DocumentPackage.read(root)
        precondition(latest["external"] as? Bool == true)
        print("PASS: real .syrup save/reopen and invalid-write preservation and external-change conflict")
    }
}
