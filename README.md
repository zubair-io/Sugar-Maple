# Sugar Maple

A local-first visual UI design, prototyping, and developer-handoff workbench for macOS.

The working implementation includes an Angular editor bundled in a Mac WKWebView, pages and editable primitives, multi-selection, responsive CSS layouts, linked components, Repeat Grid text data, click-through preview, portable code exports, local document checkpoints, and a Swift MCP server operating on the same document. The broader MVP is still in progress; see the [acceptance stories and current boundaries](docs/development/mvp-acceptance.md).

## Run

Requirements: Bun 1.4.2 and Xcode 27 with the macOS SDK. The Mac target currently supports macOS 15+; older OS behavior has not yet been tested. Angular framework 22.1.7 and CLI/build tooling 22.1.8 were the latest stable npm releases when bootstrapped.

```sh
bun install --frozen-lockfile
bun run dev:mac
```

This builds the Angular editor, bundles its assets in the app, builds the Swift host, signs the development app locally, and launches it. The app runs offline without a web development server. Development output is under `build/DerivedData/Build/Products/Debug/Sugar Maple.app`.

For browser development:

```sh
bun run dev
```

For Xcode development, run `bun run build:web` first, then open `src/apple/Sugar Maple.xcodeproj`, select **Sugar Maple / My Mac**, and Run. Rebuild web assets after editor changes before relaunching Xcode's app. The bundled editor build phase fails clearly if assets are missing.

## Verify

```sh
bun test src/web/tests
bun run build:web
# With Google Chrome installed (starts its own dev server when needed):
bun run test:e2e
# With Mac app running:
bun run test:mcp
```

[Acceptance stories](docs/development/mvp-acceptance.md) include native persistence checks. [MCP setup](docs/development/mcp.md) describes the local endpoint, stdio adapter, credentials and transaction contract.

## Architecture

- Angular 22 and Bun; HTML/CSS and inline SVG canvas.
- A narrow, pinned `_Maple` UI subset for editor chrome. Authored document primitives remain independent of that library.
- One editor-owned scene graph and validated, undoable command path shared by human editing and MCP.
- Swift MCP host at `127.0.0.1:48480`, with a stdio adapter to the same app.
- Automatic local saves: new Mac documents get managed `.syrup` packages; opened or explicitly saved documents update their chosen file. The browser saves to IndexedDB. Separate recovery checkpoints protect failed package writes. Yjs currently backs the document store; [CRDT evaluation](docs/planning/crdt-evaluation.md) records the comparison checkpoint.

Neither sibling reference checkout is required to build.

## Specifications and delivery

- [Desktop editor UI](docs/design/editor-ui.md)
- [Architecture decisions](docs/planning/architecture.md)
- [Product requirements](product.md)
- [Original RFC and amendments](docs/rfcs/RFC-2026-SYRUP-001.md)
- [MVP issue index](docs/planning/README.md)
- [MVP tracker](https://github.com/zubair-io/Sugar-Maple/issues/1)
- [Contributor and agent guidance](AGENTS.md)
- [Jules review setup and session cleanup](docs/development/jules.md)

Architecture decisions and current acceptance criteria take precedence over older RFC details. Delivery uses incremental, stacked PRs. Local issue Markdown exports and publishing data are intentionally excluded from Git.


### Autosave

Edits, posted comments, agent transactions and undo/redo save automatically. The footer shows Saving, Saved locally / Saved to .syrup bundle (Mac), Saved in this browser, or Save failed. New Mac documents are stored under `~/Library/Application Support/SugarMaple/Documents/`; File → Save or Save As chooses a normal file location. Saved locations survive app restarts. Earlier managed documents and per-document recovery snapshots remain on disk when you create another document.

New/Open wait for pending writes; failures retain a replacement confirmation. Normal Mac quitting waits for queued saves and stays open on failure. Browser saves remain local to that browser profile. An unposted comment is still an in-memory draft; posting it adds it to the autosaved document.
