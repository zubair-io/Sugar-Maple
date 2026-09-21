# Local Sugar Maple MCP

Build and launch with `bun run dev:mac`. The Swift Mac host listens only at `http://127.0.0.1:48480/mcp`. The editor is bundled and needs no development server. The server uses MCP protocol `2025-11-25`, stateless Streamable HTTP JSON responses, and a stdio adapter to that same host.

The random per-launch bearer token is stored with mode 0600 at `~/Library/Application Support/SugarMaple/mcp-token` for the development build. It is never printed in logs. An occupied port is reported in the Mac app. Browser Origins are rejected; use a local MCP client, not a browser fetch. A signed sandboxed distribution may place application support inside its container; set `SUGAR_MAPLE_TOKEN_FILE` for the adapter if needed.

For stdio-capable clients:

```json
{
  "mcpServers": {
    "sugar-maple": {
      "command": "bun",
      "args": ["/absolute/path/to/Sugar-Maple/tools/mcp-stdio.ts"]
    }
  }
}
```

Launch the Mac app first. Use `capabilities` for the complete transaction schema and supported primitive types, then `document.get` for the active document ID, pages and revision. Example `transaction.apply` arguments:

```json
{
  "documentId": "replace-with-current-document-id",
  "expectedRevision": 0,
  "requestId": "unique-request-1",
  "operations": [
    {"type": "node.add", "node": {"id": "board-1", "kind": "artboard", "pageId": "replace-with-page-id", "name": "Sign In", "width": 393, "height": 852}},
    {"type": "node.add", "node": {"kind": "text", "pageId": "replace-with-page-id", "parentId": "board-1", "name": "Heading", "text": "Welcome", "x": 24, "y": 48}}
  ]
}
```

Coordinates are parent-relative CSS pixels. Reuse a request ID only for an identical retry. A batch is validated fully before any mutation and is one undo step. UI and MCP share the editor-owned document; the host does not maintain another writable copy. `render.capture` requires `documentId` and `expectedRevision`, waits for fonts and layout, captures the actual WKWebView, and rejects a superseded revision. Committed edits are not automatically durable `.syrup` saves.

`document.new` replaces the current editor document. Save current work first. Save/open use the Mac file picker and are not exposed as arbitrary-path MCP tools.

ChatGPT client connection has not been validated. Direct loopback access depends on the client's MCP support; this implementation does not create a public tunnel.

## Composition and rendered geometry

The transaction schema returned by `capabilities` includes `component.create`, `component.insert`, `component.detach`, `repeat.create` and `repeat.populate`. Repeat text values are a JSON string array. Read the discovered schema rather than assuming unsupported operations.

After selecting a node with `selection.set`, call `viewport.fit` to frame its page, then `layout.inspect` to read actual DOM bounds in viewport CSS pixels. These are measured bounds after layout, distinct from authored parent-relative coordinates. `render.capture` remains revision-bound. `code.export` accepts `svg` and complete `swiftui` source; unsupported vector-to-SwiftUI conversion returns an explicit tool error.

The official SDK integration test creates and renders a temporary artboard/text/rectangle batch, checks bounds, exports SwiftUI, captures PNG evidence, then undoes the batch and verifies the original document is restored.
