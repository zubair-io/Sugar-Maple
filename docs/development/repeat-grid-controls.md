# Repeat Grid Canvas controls

Partial implementation toward [#13](https://github.com/zubair-io/Sugar-Maple/issues/13), built on the camera/vector correction in #85. This branch must pass final-head review/CI and resulting-main verification before delivery is claimed.

Selected fixed-size Repeat Grids expose emerald row/column handles and a gutter slider. Controls use the existing Whiteboard pointer pipeline and shared `repeat.resize` command. Keyboard arrows adjust one step, Shift adjusts ten, and Home/End reach the supported limits. Locked ancestry, read-only modes and active drawing prevent edits. Unsupported sizing modes show an actionable inspector explanation.

Drag previews derive temporary cells from the existing template without saving them or publishing history. Completion sends one validated transaction. Escape retains selection while cancelling the gesture; pointer cancellation, stale revisions, selection/page/mode changes and concurrent deletion discard it. Revision-bound captures refuse unfinished gestures. A partial final row stays partial when changing the gutter. Resizing preserves surviving cell IDs and imported data, includes border/padding in its extent and preserves a rotated free-layout grid's world origin.

## Verification

Run with the pinned Bun 1.4.2 installed by the lockfile:

```sh
bun test src/web/tests
bun run --cwd src/web typecheck
bun tools/browser-acceptance.ts
bun run build:mac
bun tools/native-acceptance.ts
```

The suites include real browser pointer capture, zoom 0.5/1.5, keyboard controls, cancellation, stale deletion, data/ID retention and undo; real production WKWebView rendering and control routing; actual native HTTP MCP command/layout/capture/durability; and existing package/portable consumer regressions. Source-bound local evidence is recorded separately under `docs/reviews/repeat-grid-controls-2026-10-02` when these gates finish. The native scripted pointer fixture explicitly uses a local capture shim; OS input and full VoiceOver require separate evidence.

## Remaining #13 scope

Canonical cells are still materialized in the document (maximum 100); temporary drag projection is not the requested virtual-cell representation. CSV/JSON and local images still use the existing file/mapping/preview/apply workflow; direct data/image-folder drops remain pending. Fixed-size template controls do not resolve responsive template sizing. These gaps keep #13 open.
