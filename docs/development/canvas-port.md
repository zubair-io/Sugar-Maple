# Canvas port delivery record

Goal: integrate the reusable Just-Maple Whiteboard canvas into the actual Sugar Maple editor, resolve QA-01 through QA-10 from the October 1 product review, validate and review the work, and merge logical commits to main.

The later R5–R10 feature proposals remain roadmap work. The port keeps the existing document store, command validation, component synchronization, history, persistence and MCP authoritative. Native form controls remain available in preview. Canvas layout, selection, assets, comments and capture must use the same projection.

Baseline: `919588f` plus pending editor header/file tabs/filename work. A tracked patch and untracked archive are preserved locally under `build/canvas-port-safety`. The pending filename changes passed the real Swift autosave fixture; pending editor changes passed 23 model tests, typecheck and production build. Remote main's `7173ef7` review fixes were incorporated with the new inspector retained.

## Delivery gates

- QA-01/02: structured bridge errors and strict MCP input validation.
- QA-03/04: variant/token precedence and dependency-complete component clipboard.
- QA-05/09: document-wide prototype target inspection and implemented dissolve preview.
- QA-06/07: multiline web and SwiftUI typography/padding fidelity, with consuming fixtures.
- QA-08: node-level asset decode diagnostics and repair guidance.
- QA-10: original complete browser acceptance command green.
- Canvas: layout and transforms, visible-node culling, hit testing and pointer cancellation, drag/resize/multi-select undo, comment placement, keyboard access, DOM preview, native capture and persistence.
- Review: inspect the complete diff, run original checks plus port regressions, and record meaningful limitations.
- Merge: fetch main again, resolve any divergence, rerun affected checks, merge and push main.

This file is updated with actual evidence as work progresses. A passing source test alone does not establish visual parity or native workflow completion.

## Implemented and reviewed

The actual design viewport now renders through the vendored Just-Maple Whiteboard CanvasComponent and a Sugar Maple Canvas2D painter. The sibling project is not needed at build time. Its source revision and original hashes are in `src/web/src/app/canvas/whiteboard/provenance.json`. The local Yjs/Awareness adapter schedules paints; it never replaces the authored Sugar Maple store or connects a collaboration transport.

A retained layout projection handles free, horizontal, vertical and grid layouts, fixed/fill/hug/percent sizing, explicit whitespace, padding/borders, nested rotations and clipped hit testing. The painter uses the same projection as fit, selection and MCP inspection. It paints viewport-intersecting branches on one DPR-aware canvas. Comments use the same camera. Preview retains native DOM buttons and inputs.

A drag/resize commits once through the existing transaction store. Cancellation, blur, disabled input, page/document/mode switching and an intervening agent revision discard the transient draft. The Layers panel and a focusable resize handle preserve keyboard editing. The underlying Whiteboard camera retains pan, wheel/modifier zoom and pinch input.

Source review corrected radial-gradient painting, wrapped hug-text allocation before vertical fill, stale gesture overlays, pointer capture guards, observer disposal, image-state signal invalidation, and ancestor-aware paint eligibility. The filename/header/tab work that was present before the port was reviewed, backed up and retained. Remote main's review fixes were incorporated.

The first independent Jules review exposed a review-tool coverage bug: its first-80-KB cutoff was consumed by the preserved design archive. The reviewer now prioritizes complete shipping source, tool, test and workflow diffs within a 350-KB budget, identifies omitted ancillary files, and fails rather than silently omitting shipping code. Regression fixtures cover archive displacement, complete hunks and quoted Swift paths; the actual PR diff was checked for complete shipping-source inclusion before requesting the corrected review.

The corrected independent review flagged a force cast in native Open. The upstream package reader already validates a dictionary, but the host now uses a guarded cast as well. The actual persistence read path rejects array/null/syntax-invalid/missing-document/unsupported-version packages, preserves recovery, and still opens valid files. The review's image-import warning was assessed and the revision guard retained: a delayed import or replacement must not overwrite intervening human/agent edits. Remote selection IDs concern network coediting, which the local adapter does not enable.

| Finding | Resolution | Verification |
| --- | --- | --- |
| QA-01 | Native bridge preserves structured tool errors and recovery context | Real SDK HTTP + stdio stale/wrong/invalid failures |
| QA-02 | Strict discovered input schemas reject invalid export targets | Runtime browser + HTTP + stdio; atomic invalid batch |
| QA-03 | Literal variant fill shadows inherited token; variant token binding and local overrides have defined precedence | Component portability tests; variant/reset/undo regressions |
| QA-04 | Editable clipboard carries recursive master dependencies, variants and remapped token bindings | Cross-document model fixture; inherited structural synchronization and undo |
| QA-05 | Prototype picker lists all document artboards with page context | Browser checks of a real cross-page link |
| QA-06 | Web exports preserve intentional whitespace | Export fixtures, real Angular/Tailwind consumers and browser rendering |
| QA-07 | SwiftUI controls retain font size/weight and stack/control padding | All-weight source fixture; actual generated consumer typechecks with SwiftUI |
| QA-08 | Loading/decode diagnostics identify nodes; imports validate bytes; Replace image preserves identity and geometry | Corrupt bytes, rejected repair with unchanged revision, successful repair and undo in the browser |
| QA-09 | Preview consumes dissolve, exposes transition selection, retains Back and respects reduced motion | Real DOM animation and unchanged authored revision |
| QA-10 | Complete original browser runner is green, with canvas regressions added | 15 suites; CI invokes the same runner and now explicitly gates typecheck |

## Acceptance evidence

The committed [verification record](../reviews/canvas-delivery-2026-10-01/verification.json), [delivery report](../reviews/sugar-maple-canvas-delivery-2026-10-01.html), and [native screenshot](../reviews/canvas-delivery-2026-10-01/native-canvas.jpg) contain the review result. The original product report is preserved as a historical baseline with a link to this delivery.

- 37 model tests and 153 assertions pass. All 15 browser acceptance suites pass, including the original strict phone Canvas/SVG pixel comparison. Budgets and pixel tolerances were not relaxed.
- Actual canvas/DOM preview geometry agrees within one CSS pixel for the representative free/stack/grid fixture, borders/padding, fixed/fill/hug/percent, measured text and wrapped hug text followed by fill content.
- The existing 18-page, 1,154-node Just-Maple design snapshot renders, has no clipped preview labels, and passes onboarding/evidence/notebook navigation. Its helper now captures the actual canvas and scopes actions to the current preview screen during dissolve.
- Typecheck, production web bundling and the actual Mac app build pass. Existing bundle/style warning thresholds remain; hard limits pass.
- The official MCP SDK exercised real native HTTP and stdio, exact revision-bound canvas capture, durable autosave, atomic edit/undo, retries, typed failures, token rejection and Origin rejection. Native component and folder transport checks also pass.
- Native UI Open selected a `.syrup` package as a document. Save As updated the filename and active tab. Native layer movement and keyboard resizing undo independently. A real native pointer drag was read through MCP and separately undone from its setup batch.
- Forced termination and relaunch of the isolated QA app preserved the scene, revision, retry receipt, undo and redo. Native persistence actor tests also pass through collisions, case-only rename, external modification conflicts and recovery preservation.
- The original user's running app and storage were preserved. The final QA app uses its own bundle identifier, support folder and loopback port. Debug-only overrides are ignored in Release.

The local 1,000/5,000-node Chrome stress fixture paints 110/209 nodes, respectively, with approximately 0.8/1.0 ms CPU flush time in the final sample on Apple M5 Max / 128 GB. This measures a warm render flush after projection, not command validation, GPU work, input latency, FPS or lower-end hardware. Raw samples and the conservative local regression ceiling are recorded separately. The Layers panel remains unvirtualized.

## Remaining product work

R5–R10 remain product roadmap items: richer typography/constraints, everyday form semantics and overlays, portable asset catalog/data population, a pinned production UI-library manifest and mappings, scoped agent reads/incremental invalidation, and isolated real-code runtimes. JavaScript/Swift library import and arbitrary code execution have not been shipped by this port.

SwiftUI still explicitly rejects paths, gradients and responsive sizing; named images require an asset catalog. The tested fixes do not claim complete visual equivalence across targets. Native package Open is supported; a Finder double-click association is not advertised. Development signing/builds pass; notarized distribution has not been validated.

## Reproduction

Run `bun install --frozen-lockfile`, `bun run test`, `bun run --cwd src/web typecheck`, `bun run build:web`, `bun run test:e2e` and `bun run build:mac`. For isolated native UI/MCP acceptance, follow [MCP development instructions](mcp.md#canvas-acceptance-and-isolated-native-qa). The original standalone experiment is retained in `prototypes/whiteboard-ui`; its three tests, typecheck and build pass. Existing session-cleanup utility tests use fake API responses and passed without contacting an external service.
