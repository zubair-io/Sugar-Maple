# MVP acceptance stories

The first implementation checkpoint is a runnable macOS editor, with the same commands exposed to local MCP clients. This checkpoint does not close the broader MVP tracker.

| Job | Acceptance flow | Evidence |
| --- | --- | --- |
| Start a design | New file → artboard → text → second page | Bun model tests and browser interaction test |
| Refine a layout | Change text, drag an item, inspect updated coordinates | Real browser pointer test plus document reads |
| Recover an edit | Undo one gesture or agent batch, redo, preserve earlier human changes | Model and real MCP SDK tests |
| Keep my work | Save a real `.syrup` package, reopen it, reject invalid replacement | Native file-system round-trip test; native picker smoke check |
| Hand off an element | Select in Developer mode; inspect generated semantic HTML | Browser interaction test |
| Drive the editor | Discover tools → atomic edit → read → undo → snapshot | Swift HTTP host and official MCP SDK, HTTP and stdio |
| Target safely | Reject stale revision, wrong document, invalid token and foreign Origin | Model and transport tests |

## Commands

```sh
bun install --frozen-lockfile
bun test src/web/tests
bun run build:web
bun run dev
# In another terminal, with Chrome installed:
bun src/web/tests/editor-e2e.ts
bun run dev:mac
# With the Mac app running:
bun tools/mcp-integration.ts
bun tools/mcp-smoke.ts
```

Native package test:

```sh
swiftc 'src/apple/Sugar Maple/DocumentPackage.swift' tools/native-persistence-test.swift -o /tmp/sugar-maple-persistence-test
/tmp/sugar-maple-persistence-test
```

The MCP integration test temporarily adds a page and undoes it. Native snapshot evidence and comparison results are written under ignored `build/evidence/`.

## Current boundaries

The initial checkpoint covers pages, semantic primitives, parent relationships, basic CSS layouts, manual geometry, color tokens, preview navigation, developer snippets, editable clipboard payloads, checkpoint persistence and the early MCP loop. Durable history across restarts, complete asset import/export, full component/Repeat Grid semantics, advanced selection, complete export fidelity and release packaging remain tracked MVP work. The document format remains version 1 with an explicit version check; migration fixtures are required before changing it.

Browser recovery currently uses a local checkpoint; the native app stores a recovery checkpoint separately from the user-selected `.syrup` package. Recovery must never be described as a successful save to that package.

## Composition and handoff increment

Linked instances now propagate master property edits while retaining per-instance overrides. Repeat Grid creates a grid of linked cells and populates text from a JSON array. Duplicating a frame includes its subtree. Color tokens import from DTCG opaque sRGB values (aliases resolve on import) and export as DTCG values. Other token types are rejected explicitly.

Developer handoff includes complete SwiftUI view source with `@State` fields and action callbacks, plus semantic web/Tailwind output. The generated Swift fixture is type-checked with `swiftc`. SwiftUI vector-path export is explicitly unsupported; named images require assets in the consuming native catalog.

SVG import is a bounded subset: explicit six-digit colors and supported geometry, no scripts, styles, transforms, filters or external references. Unsupported inputs fail before mutation. SVG/PNG output is generated from scene semantics. These formats approximate platform text/control rendering; they are not a claim of pixel-identical native/web export.

```sh
bun src/web/tests/export-fixture.ts
swiftc -typecheck build/evidence/ExportFixture.swift
# With browser dev server running:
bun src/web/tests/handoff-e2e.ts
```
