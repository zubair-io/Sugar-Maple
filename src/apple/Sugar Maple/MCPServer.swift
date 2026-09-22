import Foundation
import Network
import Security

@MainActor
final class MCPServer {
    private let listener: NWListener
    private weak var host: EditorHost?
    private let token: String
    private var lastRender = Date.distantPast
    init(host: EditorHost) throws {
        self.host = host
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { throw HostError.message("Token generation failed") }
        token = Data(bytes).base64EncodedString()
        let tokenURL = host.support.appendingPathComponent("mcp-token")
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: 48480)
        listener = try NWListener(using: parameters)
        let credential = token
        listener.stateUpdateHandler = { [weak host] state in
            Task { @MainActor [weak host] in
                switch state {
                case .ready:
                    do {
                        try Data(credential.utf8).write(to: tokenURL, options: .atomic)
                        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: tokenURL.path)
                        host?.serverStatus = "Ready · 127.0.0.1:48480"
                    } catch { host?.serverStatus = "MCP credential error: \(error.localizedDescription)" }
                case .failed(let error): host?.serverStatus = "MCP port 48480 unavailable: \(error.localizedDescription)"
                default: break
                }
            }
        }
        listener.newConnectionHandler = { [weak self] connection in
            Task { @MainActor [weak self] in self?.accept(connection) }
        }
        listener.start(queue: .main)
    }
    private func accept(_ connection: NWConnection) {
        connection.start(queue: .main)
        DispatchQueue.main.asyncAfter(deadline: .now() + 30) { connection.cancel() }
        receive(connection, Data())
    }
    private func receive(_ connection: NWConnection, _ buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, done, error in
            Task { @MainActor [weak self] in
                guard let self else { connection.cancel(); return }
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
                guard start.count == 3, start[1] == "/mcp", headers["host"] == "127.0.0.1:48480", headers["origin"] == nil, headers["transfer-encoding"] == nil else { self.respond(connection,403,["error":"Only direct loopback MCP requests are allowed"]); return }
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
    private func handle(_ rpc: [String:Any]) async throws -> Any {
        guard let host else { throw HostError.message("Editor disconnected") }
        switch rpc["method"] as? String {
        case "initialize": return ["protocolVersion":"2025-11-25", "capabilities":["tools":[:]], "serverInfo":["name":"Sugar Maple","version":"0.1.0"], "instructions":"Read capabilities and document before edits. All positions are parent-relative CSS pixels. Transactions require documentId, expectedRevision and a unique requestId. New documents replace the current editor document; save work first."] as [String:Any]
        case "ping": return [:] as [String:Any]
        case "tools/list":
            let capabilities = try await host.dispatch("capabilities",[:]) as! [String:Any]
            return ["tools": MCPTools.list(transactionSchema: capabilities["transactionSchema"]!, commentsQuerySchema: capabilities["commentsQuerySchema"]!)]
        case "tools/call":
            let params = rpc["params"] as? [String:Any] ?? [:]
            guard let name = params["name"] as? String, MCPTools.names.contains(name) else { throw HostError.message("Unknown tool") }
            let args = params["arguments"] as? [String:Any] ?? [:]
            do {
                if name == "render.capture" {
                    guard Date().timeIntervalSince(lastRender) >= 0.1 else { throw HostError.message("Render throttled: maximum 10 requests per second") }
                    lastRender = Date(); return try await host.snapshot(args)
                }
                let value = try await host.dispatch(name,args)
                let text = String(data:try JSONSerialization.data(withJSONObject:value,options:[.sortedKeys]),encoding:.utf8)!
                return ["content":[["type":"text","text":text]]]
            } catch { return ["isError":true,"content":[["type":"text","text":error.localizedDescription]]] as [String:Any] }
        default: throw HostError.message("Unsupported MCP method")
        }
    }
}
