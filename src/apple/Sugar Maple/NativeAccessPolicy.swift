import Foundation

/// Shared checks for the bundled application origin and its resource boundary.
enum NativeAccessPolicy {
    static func trustedOrigin(scheme: String, host: String, port: Int) -> Bool {
        scheme == "sugar-maple" && host == "app" && port == 0
    }
    static func trustedURL(_ url: URL) -> Bool {
        url.scheme == "sugar-maple" && url.host == "app" && url.port == nil && url.user == nil && url.password == nil
    }
    enum ResourceHost: String { case app, preview }
    static func resourceURL(_ url: URL, root: URL, host: ResourceHost = .app) throws -> URL {
        guard url.scheme == "sugar-maple", url.host == host.rawValue, url.port == nil,
              url.user == nil, url.password == nil else { throw CocoaError(.fileReadNoPermission) }
        let path = url.path == "/" ? "/index.html" : url.path
        let base = root.standardizedFileURL.resolvingSymlinksInPath()
        let file = base.appendingPathComponent(path).standardizedFileURL.resolvingSymlinksInPath()
        guard file.path.hasPrefix(base.path + "/") else { throw CocoaError(.fileReadNoPermission) }
        return file
    }
}
