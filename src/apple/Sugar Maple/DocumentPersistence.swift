import Foundation
import CryptoKit

/// Serial disk I/O and document-specific destinations, independent of the active UI.
actor DocumentPersistence {
    struct Binding: Codable {
        let url: URL
        let fingerprint: String
        let managed: Bool
    }
    let root: URL
    private var bindings: [String: Binding]?
    init(root: URL) { self.root = root }

    private func loadBindings() throws {
        guard bindings == nil else { return }
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let url = root.appendingPathComponent("file-bindings.json")
        bindings = FileManager.default.fileExists(atPath: url.path)
            ? try JSONDecoder().decode([String: Binding].self, from: Data(contentsOf: url)) : [:]
    }
    private func persistBindings() throws {
        try JSONEncoder().encode(bindings ?? [:]).write(to: root.appendingPathComponent("file-bindings.json"), options: .atomic)
    }
    private func key(_ id: String) -> String {
        SHA256.hash(data: Data(id.utf8)).map { String(format: "%02x", $0) }.joined()
    }
    private func identity(_ data: Data) throws -> String {
        let checkpoint = try DocumentPackage.validate(JSONSerialization.jsonObject(with: data))
        return (checkpoint["document"] as! [String: Any])["id"] as! String
    }
    func load() throws -> Data? {
        try loadBindings()
        let url = root.appendingPathComponent("recovery.json")
        return FileManager.default.fileExists(atPath: url.path) ? try Data(contentsOf: url) : nil
    }
    func destination(_ id: String) throws -> URL? {
        try loadBindings()
        guard let binding = bindings?[id], !binding.managed else { return nil }
        return binding.url
    }
    func read(_ url: URL) throws -> Data {
        try JSONSerialization.data(withJSONObject: DocumentPackage.read(url))
    }
    func fingerprint(_ url: URL) throws -> String { try DocumentPackage.fingerprint(url) }
    func adopt(_ url: URL, id: String, fingerprint: String) throws {
        try loadBindings()
        bindings?[id] = Binding(url: url, fingerprint: fingerprint, managed: false)
        try persistBindings()
    }
    /// Keep a per-document fallback even if writing the chosen package fails.
    @discardableResult
    func save(_ data: Data, to chosenURL: URL? = nil) throws -> Bool {
        try loadBindings()
        let id = try identity(data)
        guard data.count <= 32_000_000 else { throw CocoaError(.fileWriteOutOfSpace) }
        let drafts = root.appendingPathComponent("Documents", isDirectory: true)
        try FileManager.default.createDirectory(at: drafts, withIntermediateDirectories: true)
        let old = bindings?[id]
        let managed = chosenURL == nil ? (old?.managed ?? true) : false
        let destination = chosenURL ?? old?.url ?? drafts.appendingPathComponent(key(id) + ".syrup")
        // Recovery is distinct from successful package persistence.
        try data.write(to: drafts.appendingPathComponent(key(id) + ".recovery.json"), options: .atomic)
        try data.write(to: root.appendingPathComponent("recovery.json"), options: .atomic)
        let value = try JSONSerialization.jsonObject(with: data)
        try DocumentPackage.write(value, to: destination,
                                  expectedFingerprint: old?.url == destination ? old?.fingerprint : nil)
        bindings?[id] = Binding(url: destination, fingerprint: try DocumentPackage.fingerprint(destination), managed: managed)
        try persistBindings()
        return managed
    }
}
