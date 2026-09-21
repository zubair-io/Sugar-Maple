import Foundation
import CryptoKit

enum DocumentPackage {
    static func validate(_ value: Any) throws -> [String: Any] {
        guard let checkpoint = value as? [String: Any],
              let document = checkpoint["document"] as? [String: Any],
              document["version"] as? Int == 1,
              let id = document["id"] as? String, !id.isEmpty,
              document["pages"] is [[String: Any]], document["nodes"] is [[String: Any]] else {
            throw CocoaError(.fileReadCorruptFile)
        }
        return checkpoint
    }
    static func fingerprint(_ url: URL) throws -> String {
        let bytes = try Data(contentsOf: url.appendingPathComponent("document.json"))
        return SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()
    }
    static func write(_ value: Any, to url: URL, expectedFingerprint: String? = nil) throws {
        if let expectedFingerprint, try fingerprint(url) != expectedFingerprint {
            throw NSError(domain: "SugarMaple", code: 409, userInfo: [NSLocalizedDescriptionKey: "This file changed outside Sugar Maple. Reopen it or use Save As to keep both versions."])
        }
        let checkpoint = try validate(value)
        let bytes = try JSONSerialization.data(withJSONObject: checkpoint, options: [.sortedKeys])
        guard bytes.count <= 32_000_000 else { throw NSError(domain: "SugarMaple", code: 413, userInfo: [NSLocalizedDescriptionKey: "This checkpoint exceeds the current 32 MB package limit."]) }
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        try bytes.write(to: url.appendingPathComponent("document.json"), options: .atomic)
    }
    static func read(_ url: URL) throws -> [String: Any] {
        let file = url.appendingPathComponent("document.json")
        let attributes = try FileManager.default.attributesOfItem(atPath: file.path)
        guard (attributes[.size] as? NSNumber)?.intValue ?? Int.max <= 32_000_000 else { throw CocoaError(.fileReadTooLarge) }
        return try validate(JSONSerialization.jsonObject(with: Data(contentsOf: file)))
    }
}
