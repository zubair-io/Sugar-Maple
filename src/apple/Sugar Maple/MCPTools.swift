import Foundation

enum MCPTools {
    static let names = ["capabilities","document.get","document.checkpoint","document.new","transaction.apply","history.undo","history.redo","selection.set","code.export","layout.inspect","viewport.fit","render.capture"]
    static func list(transactionSchema: Any) -> [[String:Any]] {
        let string: [String:Any] = ["type":"string"]
        let revision: [String:Any] = ["documentId":string,"expectedRevision":["type":"integer","minimum":0]]
        func tool(_ name:String,_ description:String,_ properties:[String:Any] = [:],_ required:[String] = []) -> [String:Any] {
            ["name":name,"description":description,"inputSchema":["type":"object","properties":properties,"required":required,"additionalProperties":false]]
        }
        var transaction = tool("transaction.apply","Apply an atomic, undoable batch of page/node/token edits. Read document.get first. IDs returned correspond to added pages/nodes. Retry with the identical requestId and payload.")
        transaction["inputSchema"] = transactionSchema
        return [
            tool("capabilities","Discover supported primitive kinds, coordinates and transaction schema."),
            tool("viewport.fit","Fit all root elements on the current page into the visible editor viewport."),
            tool("layout.inspect","Read actual rendered viewport bounds in CSS pixels for nodes on the current page. Hidden nodes have rendered=false."),
            tool("document.checkpoint","Read a consistent versioned checkpoint including edit history. Does not write any file or mark the document saved."),
            tool("document.get","Read the current file, pages, nodes, tokens and revision."),
            tool("document.new","Create a new unsaved document, replacing the current editor document. Save current work first.",["name":string]),
            transaction,
            tool("history.undo","Undo the last human gesture or agent batch.",revision,["documentId","expectedRevision"]),
            tool("history.redo","Redo the last undone operation.",revision,["documentId","expectedRevision"]),
            tool("selection.set","Select a node and switch to its page.",["id":string],["id"]),
            tool("code.export","Export a node. SwiftUI exports a complete view with state; named image assets require an asset catalog.",["id":string,"target":["type":"string","enum":["html","angular","tailwind","css","swiftui","editable","svg"]]],["id","target"]),
            tool("render.capture","Capture the actual editor window after fonts/layout settle. Reject a superseded revision. Returns PNG image and revision metadata.",revision,["documentId","expectedRevision"])
        ]
    }
}
