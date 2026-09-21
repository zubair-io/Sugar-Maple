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
- Local `.syrup` packages and recovery checkpoints. Yjs currently backs the document store; [CRDT evaluation](docs/planning/crdt-evaluation.md) records the comparison checkpoint.

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
