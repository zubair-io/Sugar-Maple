import Foundation

@main struct PersistenceTest {
    static func main() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString).appendingPathExtension("syrup")
        defer { try? FileManager.default.removeItem(at: root) }
        let checkpoint: [String: Any] = ["document": ["version":1,"id":"test","name":"Round trip","pages":[["id":"page","name":"Page 1","order":0,"futureMetadata":["preserve":true]]],"nodes":[],"futureMetadata":["nested":[true,2,"preserve"]],"folders":[["id":"folder","name":"Folder","order":0,"futureMetadata":["preserve":true]]]], "crdt":[1,2,3]]
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
        // APFS sparse truncation exercises the real file-size gate without allocating
        // gigabytes or calling Data(contentsOf:) on an oversized checkpoint.
        let file = root.appendingPathComponent("document.json")
        let handle = try FileHandle(forWritingTo: file)
        defer { try? handle.close() }
        for size: UInt64 in [32_000_001, 3_000_000_000] {
            try handle.truncate(atOffset: size)
            let attributes = try FileManager.default.attributesOfItem(atPath: file.path)
            precondition((attributes[.size] as? NSNumber)?.uint64Value == size)
            for operation in [{ _ = try DocumentPackage.read(root) }, { _ = try DocumentPackage.fingerprint(root) }] {
                do { try operation(); fatalError("Oversized checkpoint accepted") }
                catch { precondition((error as NSError).code == CocoaError.fileReadTooLarge.rawValue) }
            }
        }
        print("PASS: real .syrup save/reopen preserves opaque document/page/folder metadata, invalid-write preservation and external-change conflict")
        print("PASS: actual read/fingerprint reject sparse 32 MB + 1 byte and 3 GB checkpoints with explicit unsigned 64-bit size checks")
    }
}
