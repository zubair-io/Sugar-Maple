import Foundation

@main struct NativeAccessTest {
    static func rejected(_ operation: () throws -> Void) {
        do { try operation() } catch { return }
        fatalError("Unexpectedly accepted an out-of-boundary operation")
    }
    static func main() throws {
        let fm = FileManager.default
        let root = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? fm.removeItem(at: root) }
        let resources = root.appendingPathComponent("Editor", isDirectory: true)
        try fm.createDirectory(at: resources, withIntermediateDirectories: true)
        try Data("app".utf8).write(to: resources.appendingPathComponent("index.html"))
        let outside = root.appendingPathComponent("private.json")
        try Data("private".utf8).write(to: outside)
        precondition(NativeAccessPolicy.trustedOrigin(scheme: "sugar-maple", host: "app", port: 0))
        for host in ["evil", "", "app.example", "preview"] {
            precondition(!NativeAccessPolicy.trustedOrigin(scheme: "sugar-maple", host: host, port: 0))
        }
        precondition(!NativeAccessPolicy.trustedOrigin(scheme: "https", host: "app", port: 0))
        precondition(!NativeAccessPolicy.trustedOrigin(scheme: "sugar-maple", host: "app", port: 80))
        precondition(NativeAccessPolicy.canImportFiles(mainFrame: true, scheme: "sugar-maple", host: "app", port: 0, directories: false))
        precondition(!NativeAccessPolicy.canImportFiles(mainFrame: false, scheme: "sugar-maple", host: "app", port: 0, directories: false))
        precondition(!NativeAccessPolicy.canImportFiles(mainFrame: true, scheme: "sugar-maple", host: "preview", port: 0, directories: false))
        precondition(!NativeAccessPolicy.canImportFiles(mainFrame: true, scheme: "https", host: "app", port: 0, directories: false))
        precondition(NativeAccessPolicy.canImportFiles(mainFrame: true, scheme: "sugar-maple", host: "app", port: 0, directories: true))
        precondition(!NativeAccessPolicy.canImportFiles(mainFrame: false, scheme: "sugar-maple", host: "app", port: 0, directories: true))
        precondition(!NativeAccessPolicy.canImportFiles(mainFrame: true, scheme: "sugar-maple", host: "preview", port: 0, directories: true))
        precondition(!NativeAccessPolicy.canImportFiles(mainFrame: true, scheme: "https", host: "app", port: 0, directories: true))
        let index = try NativeAccessPolicy.resourceURL(URL(string: "sugar-maple://app/")!, root: resources)
        let indexBytes = try Data(contentsOf: index)
        precondition(indexBytes == Data("app".utf8))
        for address in ["https://app/index.html", "sugar-maple://evil/index.html", "sugar-maple://app:80/index.html", "sugar-maple://user@app/index.html", "sugar-maple://app/../private.json", "sugar-maple://app/%2e%2e/private.json"] {
            rejected { _ = try NativeAccessPolicy.resourceURL(URL(string: address)!, root: resources) }
        }
        try fm.createSymbolicLink(at: resources.appendingPathComponent("leak.json"), withDestinationURL: outside)
        rejected { _ = try NativeAccessPolicy.resourceURL(URL(string: "sugar-maple://app/leak.json")!, root: resources) }
        let previewIndex = try NativeAccessPolicy.resourceURL(URL(string: "sugar-maple://preview/index.html")!, root: resources, host: .preview)
        precondition(previewIndex == index)
        rejected { _ = try NativeAccessPolicy.resourceURL(URL(string: "sugar-maple://preview/index.html")!, root: resources) }
        for address in ["sugar-maple://app/index.html", "sugar-maple://preview:80/index.html", "sugar-maple://user@preview/index.html", "sugar-maple://preview/../private.json", "sugar-maple://preview/%2e%2e/private.json", "sugar-maple://preview/leak.json"] {
            rejected { _ = try NativeAccessPolicy.resourceURL(URL(string: address)!, root: resources, host: .preview) }
        }

        let checkpoint: [String: Any] = ["document": ["version": 1, "id": "native-access", "name": "Test", "pages": [], "nodes": []]]
        let package = root.appendingPathComponent("Valid.syrup", isDirectory: true)
        try DocumentPackage.write(checkpoint, to: package)
        let bytes = try Data(contentsOf: package.appendingPathComponent("document.json"))
        let linkedPackage = root.appendingPathComponent("Linked.syrup")
        try fm.createSymbolicLink(at: linkedPackage, withDestinationURL: package)
        rejected { _ = try DocumentPackage.read(linkedPackage) }
        rejected { _ = try DocumentPackage.fingerprint(linkedPackage) }
        rejected { try DocumentPackage.write(checkpoint, to: linkedPackage) }
        let evil = root.appendingPathComponent("Evil.syrup", isDirectory: true)
        try fm.createDirectory(at: evil, withIntermediateDirectories: true)
        try fm.createSymbolicLink(at: evil.appendingPathComponent("document.json"), withDestinationURL: package.appendingPathComponent("document.json"))
        rejected { _ = try DocumentPackage.read(evil) }
        rejected { _ = try DocumentPackage.fingerprint(evil) }
        rejected { try DocumentPackage.write(checkpoint, to: evil) }
        let preserved = try Data(contentsOf: package.appendingPathComponent("document.json"))
        precondition(preserved == bytes)
        print("PASS: trusted origin/hostname, resource traversal and symlink isolation, package symlink read/write/fingerprint rejection and original-file preservation")
    }
}
