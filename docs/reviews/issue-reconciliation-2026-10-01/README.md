# Open-issue reconciliation — October 1, 2026

**Historical baseline assessment.** [Status after reviewed merges](current-status.md) records verified main, issue closures, candidates and remaining scope.

Baseline: `e6107e6` / merged PR #45. QA-01–QA-10 are fixed. A fixed QA defect does not fulfill every acceptance criterion of its parent issue.

Every original issue was checked against its scope and acceptance criteria. Checked boxes will only represent fully verified criteria. Broader partially shipped items remain open; deferred features retain their release boundaries.

## Issue assessment

### [#1 — [MVP tracker] Sugar Maple — local-first UI design, preview and developer handoff](https://github.com/zubair-io/Sugar-Maple/issues/1)

Status: **active tracker**.

Delivered: The Canvas port and QA-01–QA-10 are merged in PR #45.

Remaining: MVP completion depends on the remaining acceptance criteria below; post-MVP features remain outside the release gate.

### [#2 — [MVP] Validate HTML + SVG whiteboard architecture and record RFC decisions](https://github.com/zubair-io/Sugar-Maple/issues/2)

Status: **partial; architecture amended**.

Delivered: Actual Just-Maple Whiteboard Canvas2D is integrated. DOM preview/export and shared scene truth remain; Canvas/DOM parity fixtures pass.

Remaining: Record end-to-end p95 frame/startup/memory on the agreed mixed-node fixture in both engines and a 10,000-node diagnostic. CPU flush timings do not satisfy that gate.

### [#3 — [MVP] Bootstrap reproducible Angular and macOS development builds](https://github.com/zubair-io/Sugar-Maple/issues/3)

Status: **verification pending**.

Delivered: Pinned workspace and lockfile, production web bundle, macOS 15 target, offline bundled editor, and local Mac builds are implemented. This cleanup adds a macOS CI build and real native filesystem fixtures.

Remaining: Close after the new clean-checkout macOS CI job passes; development signing does not imply notarized distribution.

### [#4 — [MVP] Integrate the existing _Maple UI library and tokens](https://github.com/zubair-io/Sugar-Maple/issues/4)

Status: **partial**.

Delivered: Narrow, vendored Maple Button/Select/Field/Icon primitives and generated chrome tokens are documented; no sibling checkout or photo backend is required.

Remaining: Finish source inventory, update procedure/notices, and explicit chrome specimen/light-dark acceptance. Do not equate the existing subset with the complete Maple catalog.

### [#5 — [MVP] Bundle the editor in WKWebView with a typed native bridge](https://github.com/zubair-io/Sugar-Maple/issues/5)

Status: **partial**.

Delivered: Bundled WKWebView, native dialogs/menu routing and typed error preservation are implemented. This cleanup validates the app hostname, resource containment, and package symbolic-link rejection.

Remaining: Exercise fresh empty-cache/offline startup, inaccessible-file and capability fallbacks, complete exactly-once keyboard/native clipboard behavior and a real hostile-frame bridge attempt. Custom pasteboard payload is also tracked by #18.

Resolved review findings: QA-01.

### [#6 — [MVP] Define the scene graph and validate the CRDT and undo contract](https://github.com/zubair-io/Sugar-Maple/issues/6)

Status: **partial**.

Delivered: Versioned semantic scene, Yjs field maps, atomic commands, origin-aware grouped undo, journal replay and a bounded Automerge/Yjs diagnostic are implemented.

Remaining: Complete comparative text/drag/reparent/delete/convergence fixtures, unknown-field migration contract, repeated startup/memory/growth measurements and a final CRDT/storage decision.

### [#7 — [MVP] Implement local .syrup persistence, autosave and crash recovery](https://github.com/zubair-io/Sugar-Maple/issues/7)

Status: **partial**.

Delivered: Managed/named packages, serial autosave, immutable history snapshots, external-conflict protection, browser IndexedDB, native recovery and forced-restart history are verified.

Remaining: Canonical manifest/scenes/tokens/assets/log package, append/compaction crash injection, quota/disk-full/permission fixtures and coordinated final writes remain. Current checkpoints have a 32 MB limit.

### [#8 — [MVP] Adapt Just-Maple whiteboard navigation and selection to the hybrid renderer](https://github.com/zubair-io/Sugar-Maple/issues/8)

Status: **partial; architecture amended**.

Delivered: Vendored Whiteboard camera, pan/zoom/fit, culling, mixed geometry, hit testing, drag/corner resize, cancellation and grouped undo are delivered. Layers indexing is linear.

Remaining: Finish all-direction resize/rotation editing, snapping/distribution, rotated-parent gesture coverage, complete locked/hidden keyboard parity and Layers DOM virtualization. Canvas replaced the obsolete hybrid Design renderer.

### [#9 — [MVP] Add artboards, drawing primitives, editable text and layers](https://github.com/zubair-io/Sugar-Maple/issues/9)

Status: **partial**.

Delivered: Artboards/frames/groups/basic geometry/text/images, layers inspector, editable multiline text and saved sign-in design fixtures exist.

Remaining: Finish interactive path/freehand/connector tooling, complete reparent world-placement behavior and real Unicode/IME/caret/local-font acceptance. Rich typography is a dedicated follow-up.

### [#10 — [MVP] Implement CSS stacks, grid and responsive constraints](https://github.com/zubair-io/Sugar-Maple/issues/10)

Status: **partial**.

Delivered: Free/row/column/basic grid, gap/padding, fixed/fill/hug/percent and representative Canvas/DOM parity within 1 CSS px are verified.

Remaining: Implement wrap, bounded fr/minmax/auto-fit, full manual pins/child constraints and stack drag reorder. Verify each supported rule in Canvas, browser/WKWebView preview and web consumers.

### [#11 — [MVP] Add design token import, bindings and CSS export](https://github.com/zubair-io/Sugar-Maple/issues/11)

Status: **partial**.

Delivered: Document-owned opaque sRGB colors, color aliases, bindings, literal precedence and color token import/export are implemented.

Remaining: Extend typed registry to dimension/radius/typography/shadow and light/dark modes; pin the supported DTCG version and cover aliases/cycles/mode round trips.

Resolved review findings: QA-03.

### [#12 — [MVP] Build the component registry, library picker and instance overrides](https://github.com/zubair-io/Sugar-Maple/issues/12)

Status: **partial**.

Delivered: Local masters/instances, recursive structural propagation, named style variants, local overrides, detach/reset and dependency-complete paste are verified.

Remaining: Production registry metadata/props/slots/states, Checkbox, optional library mappings and compatible component swaps with loss previews remain.

Resolved review findings: QA-03, QA-04.

### [#13 — [MVP] Implement Repeat Grid with text and image data overrides](https://github.com/zubair-io/Sugar-Maple/issues/13)

Status: **partial**.

Delivered: Undoable Repeat Grid creation and text population, deterministic preview/export and checkpoint round trips exist.

Remaining: Replace eager structural cloning with template/per-cell semantics; retain stable cell IDs on resize; add image overrides, named field mapping, CSV/JSON validation and grid handles.

### [#14 — [MVP] Add isolated responsive preview and click-through prototyping](https://github.com/zubair-io/Sugar-Maple/issues/14)

Status: **partial**.

Delivered: Cross-page click navigation, Back, reset/viewport presets, real dissolve with reduced-motion behavior and separate inspection are implemented.

Remaining: Add overlay open/close, typed/secure inputs and state preservation; verify invalid-target diagnostics and real native isolated-preview cleanup.

Resolved review findings: QA-05, QA-09.

### [#15 — [MVP] Show component names, tokens and code targets in developer preview](https://github.com/zubair-io/Sugar-Maple/issues/15)

Status: **partial**.

Delivered: Inspector exposes authored name, local master/instance/variant/override identity and working portable copy actions.

Remaining: Show production design-system source/version/platform mappings, state, token identity and authored-versus-measured rules; verify nested keyboard inspection and each advertised copy payload.

### [#16 — [MVP] Copy portable Angular, semantic HTML, Tailwind 4 and CSS](https://github.com/zubair-io/Sugar-Maple/issues/16)

Status: **partial**.

Delivered: Standalone semantic HTML/CSS, Angular and Tailwind consumers compile/render; multiline whitespace, tokens and supported layout fixtures are verified.

Remaining: Optional mapped snippets require actual pinned library API verification. Complete classes-only payloads, asset/style packaging, accessible control attributes and action integration guidance.

Resolved review findings: QA-03, QA-06.

### [#17 — [MVP] Copy idiomatic SwiftUI with optional design-system mappings](https://github.com/zubair-io/Sugar-Maple/issues/17)

Status: **partial**.

Delivered: Standalone SwiftUI consumer compiles; all nine font weights and control/stack padding are covered. Unsupported path/gradient/responsive exports reject explicitly.

Remaining: Verify supported visual equivalence, enabled/state/secure-input semantics, self-contained image assets and optional pinned-library snippets. No CSS-to-SwiftUI parity claim.

Resolved review findings: QA-07.

### [#18 — [MVP] Copy and paste editable UI elements across documents](https://github.com/zubair-io/Sugar-Maple/issues/18)

Status: **partial**.

Delivered: Versioned editable clipboard preserves nested master/variant/token dependencies, remaps identity and undoes atomically; browser envelope/native text fallback exists.

Remaining: Add native custom pasteboard type, permission-denied/manual fallback acceptance, sanitized HTML/common-Tailwind import allowlist and cross-app clipboard/assets tests. Arbitrary source remains unevaluated.

Resolved review findings: QA-04.

### [#19 — [MVP] Import local assets and export selection as SVG or PNG](https://github.com/zubair-io/Sugar-Maple/issues/19)

Status: **partial**.

Delivered: Local raster assets, SVG/PNG supported exports, decode diagnostics, replacement and undo are implemented.

Remaining: Local fonts/catalog/crop-fit behavior, supported SVG import coverage, mixed-content 1x/2x export fixtures, cancellation and missing-font/oversize/external-asset cases remain.

Resolved review findings: QA-08.

### [#20 — [MVP] Bring up the MCP server and live editor command loop early](https://github.com/zubair-io/Sugar-Maple/issues/20)

Status: **partial**.

Delivered: Real SDK HTTP/stdio operate on one native-owned editor document; grouped transactions, retries, revision-bound capture, typed validation/errors, token/Origin rejection and pointer readback are verified.

Remaining: Complete occupied-port, foreign-Host, disconnected/loading/timeouts and reconnect/cleanup transport fixtures plus versioned output schemas. Mac-first host supersedes the initial browser-host plan.

Resolved review findings: QA-01, QA-02.

### [#21 — [MVP] Validate the complete offline design-to-code workflow and package release](https://github.com/zubair-io/Sugar-Maple/issues/21)

Status: **release gate open**.

Delivered: Model/browser/consumer/native/MCP/recovery gates passed for PR #45; source/evidence and CI links are available.

Remaining: All remaining MVP acceptance, measured end-to-end performance/100 MB stress, VoiceOver/offline fresh-launch and release artifact/install/rollback/signing status must be recorded before release.

Resolved review findings: QA-06, QA-07, QA-10.

### [#22 — [Post-MVP] Add peer collaboration, mobile companion and Git history](https://github.com/zubair-io/Sugar-Maple/issues/22)

Status: **deferred; not a release blocker**.

Delivered: No peer networking/mobile companion/Git integration was added by the Canvas port.

Remaining: Create a follow-up RFC and distinct peer/mobile/Git slices with convergence, authenticated pairing, input parity and conflict-recovery fixtures.

### [#23 — [Post-MVP] Add advanced vector editing](https://github.com/zubair-io/Sugar-Maple/issues/23)

Status: **deferred; not a release blocker**.

Delivered: Basic paths/vector serialization exist; advanced geometry was not shipped.

Remaining: Define geometry fixtures and implement Bezier handles, booleans, masks and flattening in separate slices, with preview/export parity and profiling.

### [#24 — [Post-MVP] Add prototype state machines, auto-animate and voice](https://github.com/zubair-io/Sugar-Maple/issues/24)

Status: **deferred; not a release blocker**.

Delivered: Click navigation/Back/dissolve are the current prototype subset.

Remaining: Variables/conditions/advanced triggers/auto-animate/springs/voice need separate deterministic supported-trigger slices and permission/offline/reduced-motion acceptance.

### [#25 — [Post-MVP] Extend code linkage and native export coverage](https://github.com/zubair-io/Sugar-Maple/issues/25)

Status: **deferred; not a release blocker**.

Delivered: Portable export and explicit unsupported diagnostics exist; arbitrary repository source is never implicitly executed.

Remaining: Add verified repository/Storybook linkage and named native targets. Production library manifests and isolated executable previews are now dedicated follow-ups.

### [#26 — [Post-MVP] Add automatic responsive inference and advanced component behavior](https://github.com/zubair-io/Sugar-Maple/issues/26)

Status: **deferred; not a release blocker**.

Delivered: Manual supported layouts and simple local named variants exist.

Remaining: Automatic inference/explanations, advanced Grid, slots/nested contextual variants and image/vector-mask repeated overrides remain.

### [#27 — [MVP] Extend the early MCP loop to complete feature coverage and native packaging](https://github.com/zubair-io/Sugar-Maple/issues/27)

Status: **partial**.

Delivered: Native HTTP/stdio, component/folder/comment commands, durable autosave, revision-bound capture and shared command schemas are verified.

Remaining: Expose only implemented feature tools, add versioned output schemas/examples, real MCP resources and remaining asset/library/prototype tools; test offline fresh launch, lifecycle and 10/s capture throttle.

Resolved review findings: QA-01, QA-02, QA-05, QA-08, QA-09, QA-10.

## Evidence

[Canvas delivery and native/browser/MCP evidence](../../development/canvas-port.md); [structured verification](../canvas-delivery-2026-10-01/verification.json). New native boundary and clean-checkout CI evidence will be recorded with the implementing pull request.

## Dedicated product follow-ups

- [R5: #46 — [MVP] Add portable typography controls and font diagnostics](https://github.com/zubair-io/Sugar-Maple/issues/46)
- [R6: #47 — [MVP] Add typed form inputs and overlay prototype actions](https://github.com/zubair-io/Sugar-Maple/issues/47)
- [R7: #48 — [MVP] Import Repeat Grid data with named fields and local images](https://github.com/zubair-io/Sugar-Maple/issues/48)
- [R8: #49 — [MVP] Connect a pinned production UI library through a component manifest](https://github.com/zubair-io/Sugar-Maple/issues/49)
- [R9: #50 — [MVP] Add scoped MCP reads and bounded editor discovery](https://github.com/zubair-io/Sugar-Maple/issues/50)
- [R10: #51 — [PoC] Validate isolated JavaScript and Swift UI-library previews](https://github.com/zubair-io/Sugar-Maple/issues/51)

## This cleanup validation

39 model tests / 162 assertions, 15 browser suites, production typecheck/web/macOS builds, three native filesystem/access fixtures and real SDK HTTP/stdio pass locally. Native tests use real temporary files; live MCP uses its own QA app/profile/port. [Verification record](verification.json) includes limits. At this baseline snapshot the new macos-15 CI gate was pending; it subsequently passed on reviewed main. See current-status.md.
