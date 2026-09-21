# Sugar Maple

A local-first visual UI design, prototyping, and developer-handoff workbench for macOS.

## Current status

This repository contains the initial SwiftUI application scaffold and the product, architecture, and desktop UI specifications. The app currently displays a hello-world view. The editor, document storage, and MCP server are not implemented yet.

The first working milestone is to create a file, add pages and items, edit them, save and reopen the file, and perform the same edits through MCP. Implementation will include user-story and jobs-to-be-done acceptance tests as each workflow becomes available.

## Build and run

The current scaffold targets macOS 27.0 and requires Xcode 27 with its macOS SDK. These are the scaffold settings, not a finalized minimum OS support policy.

Open the project:

```sh
open "src/apple/Sugar Maple.xcodeproj"
```

Select the **Sugar Maple** scheme and **My Mac** destination, then Run.

For a local build without code signing:

```sh
xcodebuild \
  -project "src/apple/Sugar Maple.xcodeproj" \
  -scheme "Sugar Maple" \
  -configuration Debug \
  -destination 'platform=macOS' \
  -derivedDataPath build/DerivedData \
  CODE_SIGNING_ALLOWED=NO \
  build
```

No automated test targets are included in this initial scaffold. A successful build verifies compilation only.

## Planned architecture

- A shared Angular editor bundled inside the Mac app's WKWebView, functional offline from first launch.
- HTML/CSS for layout and UI content, with inline SVG for vector content and editing overlays.
- `_Maple` UI primitives and tokens for the editor shell. Authored documents remain independent of the host UI library.
- One authoritative scene graph and validated command path shared by human editing and agent operations.
- A Swift MCP server embedded in the Mac app, using loopback Streamable HTTP at `127.0.0.1:48480` and a stdio adapter to the same host.
- Local `.syrup` documents and portable Angular, HTML/Tailwind/CSS, and SwiftUI handoff. Yjs is provisional pending the Yjs/Automerge comparison.

macOS is the first implementation target. The browser editor remains a subsequent target of the shared architecture. Neither a sibling checkout nor a remote web server is required to build the current scaffold.

## Specifications and delivery

- [Desktop editor UI](docs/design/editor-ui.md)
- [Architecture decisions](docs/planning/architecture.md)
- [Product requirements](product.md)
- [Original RFC and amendments](docs/rfcs/RFC-2026-SYRUP-001.md)
- [MVP issue index](docs/planning/README.md)
- [MVP tracker](https://github.com/zubair-io/Sugar-Maple/issues/1)
- [Contributor and agent guidance](AGENTS.md)
- [Jules review setup and session cleanup](docs/development/jules.md)

The architecture decisions and current issue acceptance criteria take precedence over older RFC details. Implementation is delivered through incremental, stacked pull requests. Local issue Markdown exports and publishing data are intentionally excluded from Git.
