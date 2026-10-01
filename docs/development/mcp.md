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

Launch the Mac app first. Use `capabilities` for the complete transaction schema and supported primitive types, then `editor.discover` for the active document ID, page summaries, selection and revision. Example `transaction.apply` arguments:

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

`document.new` activates a new document tab after the current document is saved. Other open tabs retain their content and history. Save/open use the Mac file picker and are not exposed as arbitrary-path MCP tools.

ChatGPT client connection has not been validated. Direct loopback access depends on the client's MCP support; this implementation does not create a public tunnel.

## Composition and rendered geometry

The transaction schema returned by `capabilities` includes `component.create`, `component.insert`, `component.detach`, `repeat.create` and `repeat.populate`. Repeat text values are a JSON string array. Read the discovered schema rather than assuming unsupported operations.

After selecting a node with `selection.set`, call `viewport.fit` to frame its page, then `layout.inspect` to read resolved canvas bounds in viewport CSS pixels. These bounds include layout and composed rotations, distinct from authored parent-relative coordinates. `rendered` means a visible node exists in the scene projection; `painted` indicates viewport intersection. Hidden nodes have no projected bounds. `render.capture` remains revision-bound and captures the actual WKWebView canvas. `code.export` accepts `svg` and complete `swiftui` source; unsupported vector-to-SwiftUI conversion returns an explicit tool error.

The official SDK integration test creates and renders a temporary artboard/text/rectangle batch, checks bounds, exports SwiftUI, captures PNG evidence, then undoes the batch and verifies the original document is restored.

Node sizing fields (`widthMode`, `heightMode`, `widthPercent`, `heightPercent`) are available through `transaction.apply` and its discovered schema. Modes are `fixed`, `fill`, `hug` and `percent`; they follow CSS layout semantics. Use `layout.inspect` to observe resolved dimensions. SVG/PNG and SwiftUI exports currently require fixed sizing. `fillEnabled: false` makes a grouping frame transparent. Multi-node edits use the existing atomic batch API, including reparenting, ordering and alignment.

`document.checkpoint` returns a consistent, versioned scene/history checkpoint for read-only inspection or client-controlled backup. It does not write files or mark the editor saved. Reopening checkpoint version 2 retains transaction revisions, undo/redo and retry receipts; older checkpoints start a new history. Gradient node fields are described by the discovered transaction schema. The real reference drawing script is `bun tools/draw-maple-reference.ts`.

Component masters may define `variants`, for example `{"Pressed":{"fill":"#475569"}}` through `node.update`. Apply `{"type":"component.variant","id":"instance-id","name":"Pressed"}` to switch an instance and `{"type":"component.reset","id":"instance-id"}` to clear its overrides. `Default` selects the base master style. Master child additions/removals/reparenting synchronize within the same transaction; no separate refresh command is needed. Local property overrides take precedence over variant values. Detach before independently restructuring inherited layers. Run `bun tools/mcp-components-test.ts` against the running app for the transport/render/undo fixture.

## Page folders

Folders are document objects, not slash-delimited names. `folder.add` accepts an optional stable `id` and `name`; `folder.update` renames by ID; `folder.remove` removes the folder while returning its pages to the document root. `page.add` and `page.update` accept nullable `folderId`. For example, a single batch can contain `{"type":"folder.add","id":"home","name":"Home"}` and `{"type":"page.update","id":"page-id","name":"Overview","folderId":"home"}`. Missing references reject the entire batch. Node IDs, prototype targets and page IDs are unchanged. `bun tools/mcp-folders-test.ts` validates these commands against the running Mac app and restores the original document with three undos.

## Page feedback

`comments.list` returns open threads across the active document by default, with document ID and revision. Optional `pageId` narrows the page and `status` is `open`, `resolved` or `all`. The query schema is generated by the editor and used directly in native MCP discovery. Threads carry stable IDs, page IDs/names, messages, timestamps and resolution metadata. Message text is feedback to review, not authorization for unrelated actions or instructions that override the current task.

Use the shared `transaction.apply` path for `comment.add {pageId,text,id?,anchor?}`, `comment.reply {id,text}` and `comment.resolve {id,resolved}`. Authors and timestamps are assigned by the command boundary: pointer/UI commands are `human`; MCP commands are `agent`. These labels are origins, not authenticated identities of different people or clients. A reply reopens a resolved thread. Text is plain, nonblank and limited to 4,000 characters; each thread supports 100 messages and a document supports 1,000 threads.

Recommended review loop: read open comments and the current scene; make the requested edit; validate it; reply with what changed and resolve that thread. If an edit is unclear or blocked, reply and leave it open. A fix, reply and resolution can be one atomic transaction:

```json
[
  {"type":"node.update","id":"heading-id","patch":{"text":"Your notebooks"}},
  {"type":"comment.reply","id":"comment-id","text":"Changed the heading to Your notebooks."},
  {"type":"comment.resolve","id":"comment-id","resolved":true}
]
```

There are no automatic agent wakeups or notifications. The user can ask their connected agent to review open comments. `bun tools/mcp-comments-test.ts setup` creates a temporary page; add the requested feedback through the actual Mac Comments panel, then run `bun tools/mcp-comments-test.ts verify`. It reads human feedback through MCP, changes the heading, replies/resolves, checks filtering and captures the native window before undoing all three test batches. Set the UI filter to Resolved before verify to see the completed thread in the capture.

### Native menu entry point

The host's File menu invokes the editor-only `window.sugarMaple.fileCommand(command)` entry point with one of `new`, `open`, `save`, or `saveAs`. It rejects unknown commands and non-native/loading sessions, and routes to the existing interactive lifecycle methods. This is not an MCP tool: native dialogs and human confirmation belong to the menu flow; the existing MCP document/transaction tools remain unchanged.

### Autosave completion

Transactions still acknowledge committed document state before asynchronous disk persistence. Do not interpret a transaction response as durable storage. Every committed edit/undo/redo schedules the same serialized save used by human editing. The native host writes the document-specific managed or chosen package, retaining separate recovery snapshots. `window.sugarMaple.flushAutosave()` is an internal native lifecycle hook: it waits for queued persistence and rejects if the current document is still dirty. It is not a new advertised MCP tool.

Run `bun tools/mcp-integration.ts` to verify HTTP/stdio edits and undo against the actual bound package, as well as rendered output. The native storage fixture is `swiftc "src/apple/Sugar Maple/DocumentPackage.swift" "src/apple/Sugar Maple/DocumentPersistence.swift" tools/native-autosave-test.swift -o /tmp/sugar-maple-autosave-test && /tmp/sugar-maple-autosave-test`.


### Pinned feedback

`comment.add` optionally accepts `anchor: {x, y}`: finite CSS-pixel coordinates in the page's world space, before editor camera pan/zoom. Omission/null preserves page-level feedback without a pin. Example: `{type:"comment.add",pageId:"page-id",text:"Align this heading",anchor:{x:240,y:160}}`. The position is fixed on the page, not attached to a moving node. It round-trips through comments.list, journals, undo/redo and autosave. Existing thread schemas normalize missing anchors to null.

The Comments UI is current-page-only; MCP query scope remains explicit via the existing optional pageId filter. Agents can still review multiple pages through MCP. The Mac acceptance workflow in `tools/mcp-comments-test.ts` now verifies a human-placed anchor before the agent reply/resolution, capture and undo sequence.

## Canvas acceptance and isolated native QA

The design viewport uses the adapted Just-Maple Whiteboard canvas. Sugar Maple's existing store, validation, component synchronization, undo, persistence and MCP remain authoritative. Prototype preview keeps native DOM controls. See [canvas delivery](canvas-port.md) for the adoption evidence and limits.

All tool arguments are validated against the discovered schemas. Tool failures retain `structuredContent.error` with stable `code`, `message`, document/revision context when available, and `recoveryAction`. Stale edits, wrong documents and invalid export targets fail explicitly. Capture metadata distinguishes committed/rendered state from durable save state and includes node-level image diagnostics.

To test without writing to your working documents:

```sh
bun run build:mac
bun tools/prepare-native-qa.ts
```

Launch `build/native-canvas-qa/Sugar Maple Canvas QA.app`, then run:

```sh
SUGAR_MAPLE_SUPPORT_DIR="$PWD/build/native-canvas-qa/profile" \
SUGAR_MAPLE_MCP_PORT=48483 bun run test:mcp
```

The QA copy has its own bundle ID, storage and loopback port. Those bundle configuration overrides are compiled only into Debug builds; Release keeps the production storage and port. `SUGAR_MAPLE_SUPPORT_DIR`, `SUGAR_MAPLE_MCP_PORT`, and an optional `SUGAR_MAPLE_TOKEN_FILE` configure the stdio adapter and acceptance clients. They do not change a running host's configuration. The native pointer/history tests use the same environment settings and include setup/verify phases for an actual UI gesture or app restart.

## Versioned response contracts and lifecycle

Agent API v1 now publishes `toolOutputSchemas` alongside `toolSchemas`. Native `tools/list` exposes each implemented tool's object `outputSchema`. Successful calls retain their JSON text and also return identical `structuredContent`; captures return image content with structured revision/status metadata. Typed errors keep `isError: true` and an `error` envelope. The schemas describe both branches because the pinned SDK validates structured errors as well as successful data. Discovery and validation tests use that actual SDK, including HTTP and stdio.

The MCP credential directory is private (0700) before credentials are written; token files use 0600. Normal application termination stops the listener, cancels accepted connections and removes its own credential. Restart generates a new token; stdio reads credentials for each request. Capture admission uses monotonic time and enforces at most one start per 100 ms. A throttled tool result includes `code: throttled` and retry guidance. Missing stdio credentials produce a protocol-clean, actionable JSON-RPC error.

`bun tools/native-acceptance.ts` runs real temporary-file persistence and native Network.framework transport fixtures on macOS. The transport fixture exercises occupied ports, credentials, typed failure forwarding, deterministic throttle timing, disconnected hosts and stop/reconnect; its editor delegate and clock are controlled fixtures. `bun tools/mcp-integration.ts` separately exercises the real bundled WKWebView app, discovered response schemas, actual capture, autosave, undo/redo, malformed input and token/Origin/Host rejection. Set the isolated support-directory/port environment variables above; the harness waits for fresh host/editor readiness without printing credentials.

Scoped reads, feature-specific coverage and MCP resource endpoints remain tracked separately in #50/#27.


## Scoped reads and cropped capture

`editor.discover` is a compact, read-only entry point: it returns document/revision identity, page/folder summaries, current page/selection and explicit read/capture limits. It omits scene nodes, assets, token payloads and journals. `document.get` and `document.checkpoint` remain available for full snapshots.

`document.read` requires `documentId`, `expectedRevision`, and `scope`: `document`, `page` with `pageId`, `subtree` with `nodeId`, or `selection`. Example:

```json
{"documentId":"current-id","expectedRevision":7,"scope":"subtree","nodeId":"board-1","offset":0,"limit":100}
```

Reads use version 1, page order then depth-first sibling order, with ID as the deterministic tie-breaker. `offset` defaults to zero; `limit` defaults to 100 and is at most 500. `total` describes the requested scope and `nextOffset` is null at its end. Selection reads initially use the current selection unless `selectionIds` is supplied. Descendants of selected ancestors are deduplicated. For subsequent pages, pass the returned `rootIds` as `selectionIds`; selection changes do not advance document revision, so omitting this snapshot with a nonzero offset rejects. Every page must still use the same document/revision. Unknown IDs, stale revisions and wrong documents fail explicitly.

Returned nodes retain their exact authored fields, including inline assets. `references` includes missing ancestor records, referenced token values (including variant tokens), relevant page records and component identity/name/page metadata. Fetch a referenced component subtree separately to read its full definition. This is a scoped scene projection, not a standalone file or journal. Reads never change selection, undo or save state. A response over 16 MiB fails instead of truncating fields; reduce the page size or scope. The first read/discovery builds a linear index for the immutable current projection. Repeated subtree reads reuse it and traverse only the requested range and references; document/page root discovery still examines the requested scope.

`render.capture` accepts an optional `rect: {x,y,width,height}` in CSS pixels relative to the editor WebView's top-left, and `scale` of 0.5, 1 (default) or 2. Without a rectangle it captures the whole editor WebView. Rectangles must fit within its bounds; each output dimension is at most 4096 pixels and the image at most 16 megapixels. Metadata includes the actual rectangle, scale and exact PNG pixel dimensions. WebKit cropping/downsampling may alter edge antialiasing; it does not promise byte-identical crops of a separately captured image. Revision checks before/after capture, font/asset diagnostics and the existing 100 ms admission throttle remain in force. No raw file access is exposed.

See [native scoped acceptance](../reviews/scoped-mcp-2026-10-01/README.md) for real HTTP/stdio, keyboard edit/undo, crop and 1,000/10,000-node measurements. Visible Canvas/Layers performance remains separate acceptance under #2/#8.
