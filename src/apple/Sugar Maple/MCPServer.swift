import Foundation
import Network
import Security

@MainActor
protocol MCPHosting: AnyObject {
    var mcpPort: UInt16 { get }
    var support: URL { get }
    var serverStatus: String { get set }
    func dispatch(_ method: String, _ args: [String: Any]) async throws -> Any
    func snapshot(_ args: [String: Any]) async throws -> [String: Any]
}

@MainActor
final class MCPServer {
    private let listener: NWListener
    private weak var host: (any MCPHosting)?
    private let token: String
    private let port: UInt16
    private var lastRender = -Double.infinity
    private let now: () -> TimeInterval
    private var connections: [UUID: NWConnection] = [:]
    private var stopped = false
    private let tokenURL: URL
    init(host: any MCPHosting, now: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) throws {
        self.now = now
        self.host = host
        port = host.mcpPort
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { throw HostError.message("Token generation failed") }
        token = Data(bytes).base64EncodedString()
        tokenURL = host.support.appendingPathComponent("mcp-token")
        let credentialURL = tokenURL
        // Protect the directory before the atomic credential write becomes visible.
        try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: host.support.path)
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: port)!)
        do { listener = try NWListener(using: parameters) }
        catch { throw HostError.message("MCP port \(port) unavailable: \(error.localizedDescription)") }
        let credential = token
        let endpointPort = port
        listener.stateUpdateHandler = { [weak self, weak host] state in
            Task { @MainActor [weak self, weak host] in
                guard let self, !self.stopped else { return }
                switch state {
                case .ready:
                    do {
                        try Data(credential.utf8).write(to: credentialURL, options: .atomic)
                        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: tokenURL.path)
                        host?.serverStatus = "Ready · 127.0.0.1:\(endpointPort)"
                    } catch { host?.serverStatus = "MCP credential error: \(error.localizedDescription)" }
                case .failed(let error): host?.serverStatus = "MCP port \(endpointPort) unavailable: \(error.localizedDescription)"
                default: break
                }
            }
        }
        listener.newConnectionHandler = { [weak self] connection in
            Task { @MainActor [weak self] in self?.accept(connection) }
        }
        listener.start(queue: .main)
    }
    deinit { listener.cancel() }
    func stop() {
        guard !stopped else { return }
        stopped = true
        listener.cancel()
        for connection in connections.values { connection.cancel() }
        connections.removeAll()
        if (try? String(contentsOf: tokenURL, encoding: .utf8)) == token {
            try? FileManager.default.removeItem(at: tokenURL)
        }
        host?.serverStatus = "Stopped"
    }
    private func accept(_ connection: NWConnection) {
        guard !stopped else { connection.cancel(); return }
        let id = UUID()
        connections[id] = connection
        connection.stateUpdateHandler = { [weak self] state in
            if case .cancelled = state {
                Task { @MainActor [weak self] in self?.connections.removeValue(forKey: id) }
            }
        }
        connection.start(queue: .main)
        DispatchQueue.main.asyncAfter(deadline: .now() + 30) { connection.cancel() }
        receive(connection, Data())
    }
    private func receive(_ connection: NWConnection, _ buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, done, error in
            Task { @MainActor [weak self] in
                guard let self, !self.stopped else { connection.cancel(); return }
                var all = buffer; if let data { all.append(data) }
                guard all.count < 10_000_000 else { self.respond(connection, 413, ["error":"Request too large"]); return }
                guard let boundary = all.range(of: Data("\r\n\r\n".utf8)) else {
                    if done || error != nil || all.count > 16384 { connection.cancel() } else { self.receive(connection, all) }; return
                }
                guard let header = String(data: all[..<boundary.lowerBound], encoding: .utf8) else { connection.cancel(); return }
                let lines = header.components(separatedBy: "\r\n")
                let start = lines[0].split(separator: " ").map(String.init)
                var headers: [String:String] = [:]
                for line in lines.dropFirst() {
                    let parts = line.split(separator: ":", maxSplits: 1).map(String.init)
                    guard parts.count == 2, headers[parts[0].lowercased()] == nil else { self.respond(connection,400,["error":"Malformed headers"]); return }
                    headers[parts[0].lowercased()] = parts[1].trimmingCharacters(in: .whitespaces)
                }
                guard start.count == 3, start[1] == "/mcp", headers["host"] == "127.0.0.1:\(self.port)", headers["origin"] == nil, headers["transfer-encoding"] == nil else { self.respond(connection,403,["error":"Only direct loopback MCP requests are allowed"]); return }
                guard headers["authorization"] == "Bearer \(self.token)" else { self.respond(connection,401,["error":"Invalid MCP token"]); return }
                guard start[0] == "POST" else { self.respond(connection,405,["error":"Use POST; this server is stateless"]); return }
                guard let length = Int(headers["content-length"] ?? ""), length > 0, length < 10_000_000 else { self.respond(connection,400,["error":"Invalid Content-Length"]); return }
                let payload = Data(all[boundary.upperBound...])
                if payload.count < length {
                    if done || error != nil { connection.cancel() } else { self.receive(connection,all) }; return
                }
                guard let rpc = try? JSONSerialization.jsonObject(with: payload.prefix(length)) as? [String:Any] else { self.respond(connection,400,["error":"Invalid JSON"]); return }
                if rpc["id"] == nil { self.respond(connection,202,nil); return }
                let id = rpc["id"]!
                do { self.respond(connection,200,["jsonrpc":"2.0","id":id,"result":try await self.handle(rpc)]) }
                catch { self.respond(connection,200,["jsonrpc":"2.0","id":id,"error":["code":-32603,"message":error.localizedDescription]]) }
            }
        }
    }
    private func respond(_ connection: NWConnection, _ status: Int, _ value: Any?) {
        let body = value.flatMap { try? JSONSerialization.data(withJSONObject: $0) } ?? Data()
        let header = "HTTP/1.1 \(status) Response\r\nContent-Type: application/json\r\nContent-Length: \(body.count)\r\nConnection: close\r\n\r\n"
        connection.send(content: Data(header.utf8) + body, completion: .contentProcessed { _ in connection.cancel() })
    }
    private func connectedHost() throws -> any MCPHosting {
        guard !stopped, let host else { throw HostError.tool(["code":"disconnected", "message":"Editor disconnected", "recoveryAction":"Launch Sugar Maple and reconnect to the active editor."]) }
        return host
    }
    private func handle(_ rpc: [String:Any]) async throws -> Any {
        switch rpc["method"] as? String {
        case "initialize": return ["protocolVersion":"2025-11-25", "capabilities":["tools":[:]], "serverInfo":["name":"Sugar Maple","version":"0.1.0"], "instructions":"Read editor.discover and capabilities before edits; use document.read for scoped scene reads. Node positions are parent-relative CSS pixels; capture rectangles use editor WebView CSS pixels. Transactions require documentId, expectedRevision and a unique requestId. New documents activate a new tab; existing tabs retain their content and history. Save current work before switching documents."] as [String:Any]
        case "ping": return [:] as [String:Any]
        case "tools/list":
            let host = try connectedHost()
            let capabilities = try await host.dispatch("capabilities",[:]) as! [String:Any]
            return ["tools": MCPTools.list(transactionSchema: capabilities["transactionSchema"]!, commentsQuerySchema: capabilities["commentsQuerySchema"]!, schemas: capabilities["toolSchemas"] as? [String: Any] ?? [:], outputSchemas: capabilities["toolOutputSchemas"] as? [String: Any] ?? [:])]
        case "tools/call":
            let params = rpc["params"] as? [String:Any] ?? [:]
            guard let name = params["name"] as? String, MCPTools.names.contains(name) else { throw HostError.message("Unknown tool") }
            do {
                let host = try connectedHost()
                if let arguments = params["arguments"], !(arguments is [String: Any]) { throw HostError.tool(["code":"invalid_input", "message":"Tool arguments must be an object", "recoveryAction":"Use the advertised input schema."]) }
                let args = params["arguments"] as? [String:Any] ?? [:]
                if name == "render.capture" {
                    guard now() - lastRender >= 0.1 else { throw HostError.message("Render throttled: maximum 10 requests per second") }
                    lastRender = now(); return try await host.snapshot(args)
                }
                let value = try await host.dispatch(name,args)
                let text = String(data:try JSONSerialization.data(withJSONObject:value,options:[.sortedKeys]),encoding:.utf8)!
                return ["structuredContent":value, "content":[["type":"text","text":text]]]
            } catch {
                if case HostError.tool(let details) = error {
                    return ["isError":true, "structuredContent":["error":details], "content":[["type":"text","text":error.localizedDescription]]] as [String:Any]
                }
                let message = error.localizedDescription
                let code = message.hasPrefix("Render throttled") ? "throttled" : "internal_error"
                let details: [String: Any] = ["code":code, "message":message,
                    "recoveryAction":code == "throttled" ? "Wait at least 100 ms before requesting another capture." : "Check editor readiness and retry; inspect the MCP status if the failure persists."]
                return ["isError":true,"structuredContent":["error":details],"content":[["type":"text","text":message]]] as [String:Any]
            }
        default: throw HostError.message("Unsupported MCP method")
        }
    }
}
