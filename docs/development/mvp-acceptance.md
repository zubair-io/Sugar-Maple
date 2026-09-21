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

## Responsive editing and recovery increment

- Width/height support fixed, fill, hug and percentage CSS sizing. Preview presets change the preview width without editing the saved artboard. Click-through and Back remain preview-only state.
- Shift-click and marquee select multiple nodes. Sibling grouping preserves positions with a transparent frame; grouped drags, alignment, delete and undo use atomic command batches. Layer search, hierarchy indentation, ordering and page rename are available. Arrow keys nudge by 1px; Shift changes the step to 10px.
- Browser recovery uses real IndexedDB transactions with strict durability requested. An old localStorage checkpoint can be read and migrates on the next edit. Loading blocks UI interaction until recovery finishes. This is recovery storage, not a user-selected document save.
- Generated Angular templates treat design text as literal content. A separate strict-template consumer compiles the export; Tailwind 4 generates the exported utility classes and a real browser verifies geometry against semantic HTML.
- SVG/PNG and SwiftUI currently reject responsive-size nodes rather than silently emitting fixed approximations. Rotated-parent pointer manipulation, eight-handle resizing, snapping, full pin constraints and durable undo history remain open.

Run all browser/consumer jobs with `bun run test:e2e`; it starts and cleans up its own dev server when needed. Chrome must be installed. CI installs Chrome and runs these jobs as well as the model tests and production build.

Native pointer acceptance (with the app running): `bun tools/native-pointer-test.ts setup`, drag the blue rectangle once, then `bun tools/native-pointer-test.ts verify`. The verification reads the changed coordinates through MCP, captures the actual window, and undoes the pointer gesture and original agent batch separately. This flow was exercised against the local WKWebView build. Layout settling includes an occluded-window fallback because WKWebView suspends animation-frame callbacks in the background.

## Durable history checkpoint

Checkpoint version 2 stores an initial scene plus an ordered semantic command journal. Replaying it through the same Yjs transaction/undo machinery restores grouped undo, redo branches, revisions and retry receipts. The materialized document is a verified projection; mismatches reject the file. Legacy checkpoints still open, starting a new history. This is an application journal while the CRDT storage comparison remains provisional, not the final CRDT append-log/package layout from #7.

Checkpoints are immutable snapshots so asynchronous persistence cannot combine an older scene with newer history. Save As writes a new user-selected destination. Saving an opened file compares its SHA-256 fingerprint and rejects external edits; the user can reopen or Save As. Filesystem coordination across other processes during the final write remains a release hardening task. Package writes retain the current 32 MB limit with an explicit size error.

Tests cover reload/undo/redo through real IndexedDB, retained retry receipts, corrupted projections, legacy format loading, a 5,000-node round-trip, and external-file change protection. Canonical manifest/assets directories, asynchronous append logging, compaction and crash injection during append remain open.

## Real design drawing fixture

The supplied Maple phone preview is recreated as 37 editable nodes: frames, text, vector paths, linear gradients and radial gradients with alpha stops. No flattened image is used. Browser tests compare the SVG and CSS photo-region pixels with a mean per-channel tolerance of 3/255, and exercise edit/reload/undo. `bun tools/draw-maple-reference.ts` creates the same scene through the live Swift MCP endpoint on a new page, captures the Mac window, and writes a verified `.syrup` checkpoint under `build/evidence/`. Existing pages are preserved; the drawing is one undoable batch.

The gradient inspector supports fill type and stop colors; normalized gradient geometry and alpha stops are also available through validated node commands. Gradients round-trip in editable payloads, HTML/CSS/Tailwind and SVG/PNG. SwiftUI gradient export and path gradients are explicitly unsupported. A general Sketch importer is not yet enabled; the source archive was read only to build this specific drawing fixture.
