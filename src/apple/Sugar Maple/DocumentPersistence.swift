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
    private func identity(_ data: Data) throws -> (id: String, name: String) {
        let checkpoint = try DocumentPackage.validate(JSONSerialization.jsonObject(with: data))
        let document = checkpoint["document"] as! [String: Any]
        return (document["id"] as! String, document["name"] as? String ?? "Untitled")
    }
    private func validateFilename(_ name: String) throws {
        guard !name.isEmpty,
              name == name.trimmingCharacters(in: .whitespacesAndNewlines),
              !name.hasPrefix("."), !name.contains("/"), !name.contains(":"),
              !name.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }),
              (name + ".syrup").utf8.count <= 255 else {
            throw NSError(domain: "SugarMaple", code: 400, userInfo: [NSLocalizedDescriptionKey: "Choose a filename without slashes, colons, leading dots or surrounding spaces (maximum 249 UTF-8 bytes)."])
        }
    }
    private func sameFile(_ lhs: URL, _ rhs: URL) throws -> Bool {
        let a = try lhs.resourceValues(forKeys: [.fileResourceIdentifierKey]).fileResourceIdentifier as? NSObject
        let b = try rhs.resourceValues(forKeys: [.fileResourceIdentifierKey]).fileResourceIdentifier as? NSObject
        return a != nil && a == b
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
        let (id, name) = try identity(data)
        guard data.count <= 32_000_000 else { throw CocoaError(.fileWriteOutOfSpace) }
        let drafts = root.appendingPathComponent("Documents", isDirectory: true)
        try FileManager.default.createDirectory(at: drafts, withIntermediateDirectories: true)
        let old = bindings?[id]
        let managed = chosenURL == nil ? (old?.managed ?? true) : false
        // Separate managed document folders allow independent Untitled files with real names.
        let directory = old?.url.deletingLastPathComponent() ?? drafts.appendingPathComponent(key(id), isDirectory: true)
        let destination = chosenURL ?? directory.appendingPathComponent(name + ".syrup")
        // Recovery is distinct from successful package persistence.
        try data.write(to: drafts.appendingPathComponent(key(id) + ".recovery.json"), options: .atomic)
        try data.write(to: root.appendingPathComponent("recovery.json"), options: .atomic)
        try validateFilename(name)
        let value = try JSONSerialization.jsonObject(with: data)
        let source = chosenURL == nil ? old?.url : nil
        let renaming = source != nil && source != destination
        if let old, (renaming || old.url == destination), try DocumentPackage.fingerprint(old.url) != old.fingerprint {
            throw NSError(domain: "SugarMaple", code: 409, userInfo: [NSLocalizedDescriptionKey: "This file changed outside Sugar Maple. Reopen it or use Save As to keep both versions."])
        }
        if chosenURL == nil, FileManager.default.fileExists(atPath: destination.path), source != destination {
            guard let source, try sameFile(source, destination) else {
                throw NSError(domain: "SugarMaple", code: 409, userInfo: [NSLocalizedDescriptionKey: "A file named \(destination.lastPathComponent) already exists. Choose another name or use Save As."])
            }
        }
        if renaming, let source {
            try FileManager.default.moveItem(at: source, to: destination)
        }
        do {
            try DocumentPackage.write(value, to: destination,
                                      expectedFingerprint: (renaming || old?.url == destination) ? old?.fingerprint : nil)
        } catch {
            if renaming, let source { try? FileManager.default.moveItem(at: destination, to: source) }
            throw error
        }
        bindings?[id] = Binding(url: destination, fingerprint: try DocumentPackage.fingerprint(destination), managed: managed)
        try persistBindings()
        return managed
    }
}
