import Foundation

enum HostError: LocalizedError {
    case message(String)
    case tool([String: Any])
    var errorDescription: String? {
        switch self {
        case .message(let message): return message
        case .tool(let details): return String(data: (try? JSONSerialization.data(withJSONObject: details, options: [.sortedKeys])) ?? Data(), encoding: .utf8)
        }
    }
}
