import Foundation
import Darwin

@MainActor final class TestMCPHost: MCPHosting {
    let mcpPort: UInt16
    let support: URL
    var serverStatus = "Starting"
    var failure: String?
    init(port: UInt16, root: URL) throws {
        mcpPort = port; support = root
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    }
    func dispatch(_ method: String, _ args: [String: Any]) async throws -> Any {
        if let failure {
            throw HostError.tool(["code":failure, "message":"Fixture \(failure)", "recoveryAction":"Wait for readiness and retry."])
        }
        return ["documentId":"transport-fixture", "revision":1]
    }
    func snapshot(_ args: [String: Any]) async throws -> [String: Any] {
        ["structuredContent":["revision":1], "content":[]]
    }
}
@MainActor final class TestClock { var value: TimeInterval = 10 }

@main struct NativeMCPTest {
    static func unusedPort() throws -> UInt16 {
        let socket = Darwin.socket(AF_INET, SOCK_STREAM, 0)
        guard socket >= 0 else { throw CocoaError(.fileReadUnknown) }
        defer { Darwin.close(socket) }
        var address = sockaddr_in()
        address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        address.sin_family = sa_family_t(AF_INET)
        address.sin_addr.s_addr = inet_addr("127.0.0.1")
        let bound = withUnsafePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { Darwin.bind(socket, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) }
        }
        guard bound == 0 else { throw CocoaError(.fileReadUnknown) }
        var length = socklen_t(MemoryLayout<sockaddr_in>.size)
        let named = withUnsafeMutablePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { getsockname(socket, $0, &length) }
        }
        guard named == 0 else { throw CocoaError(.fileReadUnknown) }
        return UInt16(bigEndian: address.sin_port)
    }
    @MainActor static func wait(_ message: String, until condition: () -> Bool) async throws {
        let deadline = ProcessInfo.processInfo.systemUptime + 10
        while !condition() {
            guard ProcessInfo.processInfo.systemUptime < deadline else { fatalError("Timed out: \(message)") }
            try await Task.sleep(nanoseconds: 10_000_000)
        }
    }
    static func request(_ port: UInt16, token: String, method: String = "tools/call", tool: String = "document.get") async throws -> (Int, [String: Any]) {
        var request = URLRequest(url: URL(string:"http://127.0.0.1:\(port)/mcp")!)
        request.httpMethod = "POST"
        request.timeoutInterval = 5
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["jsonrpc":"2.0", "id":1, "method":method, "params":["name":tool, "arguments":[:]]])
        let (data, response) = try await URLSession.shared.data(for: request)
        return ((response as! HTTPURLResponse).statusCode, try JSONSerialization.jsonObject(with:data) as! [String:Any])
    }
    static func errorCode(_ response: [String: Any]) -> String? {
        ((response["result"] as? [String: Any])?["structuredContent"] as? [String: Any])?["error"].flatMap { ($0 as? [String: Any])?["code"] as? String }
    }
    @MainActor static func main() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let port = try unusedPort(), clock = TestClock()
        var host: TestMCPHost? = try TestMCPHost(port:port, root:root.appendingPathComponent("one"))
        let support = host!.support
        let server = try MCPServer(host:host!, now:{ clock.value })
        defer { server.stop() }
        try await wait("listener readiness") { host!.serverStatus.hasPrefix("Ready") }
        let tokenURL = support.appendingPathComponent("mcp-token")
        let token = try String(contentsOf:tokenURL, encoding:.utf8)
        let permissions = try FileManager.default.attributesOfItem(atPath:tokenURL.path)[.posixPermissions] as! NSNumber
        precondition(permissions.intValue & 0o777 == 0o600)
        let directoryPermissions = try FileManager.default.attributesOfItem(atPath:support.path)[.posixPermissions] as! NSNumber
        precondition(directoryPermissions.intValue & 0o777 == 0o700)
        let (status, success) = try await request(port, token:token)
        precondition(status == 200)
        precondition((success["result"] as? [String:Any])?["structuredContent"] != nil)
        let conflicting = try TestMCPHost(port:port, root:root.appendingPathComponent("two"))
        do {
            let other = try MCPServer(host:conflicting)
            defer { other.stop() }
            try await wait("occupied port failure") { conflicting.serverStatus.contains("unavailable") }
            precondition(conflicting.serverStatus.contains(String(port)))
            precondition(!FileManager.default.fileExists(atPath:conflicting.support.appendingPathComponent("mcp-token").path))
        } catch {
            precondition(error.localizedDescription.contains(String(port)))
        }
        for code in ["loading", "timeout"] {
            host!.failure = code
            let (_, failure) = try await request(port, token:token)
            precondition(errorCode(failure) == code)
        }
        host!.failure = nil
        let (_, firstCapture) = try await request(port, token:token, tool:"render.capture")
        precondition((firstCapture["result"] as? [String:Any])?["isError"] == nil)
        let (_, throttled) = try await request(port, token:token, tool:"render.capture")
        precondition(errorCode(throttled) == "throttled")
        clock.value += 0.101
        let (_, nextCapture) = try await request(port, token:token, tool:"render.capture")
        precondition((nextCapture["result"] as? [String:Any])?["isError"] == nil)
        host = nil
        let (_, disconnected) = try await request(port, token:token)
        precondition(errorCode(disconnected) == "disconnected")
        server.stop(); server.stop()
        precondition(!FileManager.default.fileExists(atPath:tokenURL.path))
        // Restart the real listener on the same port/profile; old credentials must fail.
        let restarted = try TestMCPHost(port:port, root:support)
        let freshServer = try MCPServer(host:restarted)
        defer { freshServer.stop() }
        try await wait("reconnect readiness") { restarted.serverStatus.hasPrefix("Ready") }
        let newToken = try String(contentsOf:tokenURL, encoding:.utf8)
        precondition(newToken != token)
        let (denied, _) = try await request(port, token:token)
        precondition(denied == 401)
        let (reconnected, _) = try await request(port, token:newToken)
        precondition(reconnected == 200)
        print("PASS: real native MCP socket, occupied port, private credentials, structured output, typed loading/timeout/disconnected, deterministic 10/s throttle, stop and credential-rotating reconnect")
    }
}
