# Real-library preview decision — October 2, 2026

The web and native experiments render real controls with a bounded typed
contract. The decision is **GO for continued opt-in fixed-source experiments;
NO-GO for production integration or replacing Canvas authoring**.

Discovery #51 remains open until its candidates and comparison are reviewed,
merged and verified on main. Web #86 and native #87 are separate candidates.
The supported projection work in #88 now has a locally verified candidate,
[PR #95](https://github.com/zubair-io/Sugar-Maple/pull/95), with parents #25/#26
and related native fidelity #17 and token work #11. Final-head review/CI,
current-base integration and resulting-main verification remain pending.
Discovery does not close broader production import or platform coverage.

## Props-only baseline evidence and reproduction

Use Bun 1.4.2 and macOS with the macOS 14 SwiftUI API baseline. With Chrome
installed, run:

```sh
bun tools/library-preview-comparison.ts --trust-native-fixture
```

The command checks the pinned consumer/cache, builds and gates the web
fixture, runs the actual Canvas/DOM/package/native comparison, builds the
current production editor, measures assets and generates/tests the report.
It launches a fresh development server from this checkout on a private
loopback port and stops its owned process group after the run. The
macOS Editor CI job explicitly installs Chrome and runs this comparison through
`prototypes/library-preview/server-owner-test.ts` after the full native suite.
That gate verifies an unrelated listener on port 4200 receives no comparison
requests, survives the run, and the owned server leaves no live descendants.
Its canary requires port 4200 to be free; the direct comparison command above
does not. Native human-event evidence is a separately recorded
real UI run; the comparison does not simulate or repeat that input test.

Source-bound raw measurements, four actual rendered images, ARIA snapshots,
asset hashes, report and logs live in
`docs/reviews/library-preview-comparison-2026-10-02`. Run
`bun prototypes/library-preview/serve-report.ts` to inspect the committed
interactive report locally. Web and native trust/unsupported policies are in
`prototypes/library-preview/README.md` and `native/README.md`.

## Props-only baseline comparison

| Dimension | Canvas / semantic DOM | Real Web Awesome | Trusted SwiftUI helper |
| --- | --- | --- | --- |
| Editability | Real inspector props and one undo; DOM input remains ephemeral across updates | Real manifest props/variants and typed input/action events | Real native controls return typed input/action events |
| Layout fidelity | Same five-node fixture; maximum Canvas/DOM geometry delta is zero | Props-only consumer uses intrinsic package layout, not all authored bounds | Props-only VStack uses its own layout |
| Variant fidelity | Primary identity changes while semantic paint fields remain unchanged | Primary renders `variant=brand` | Primary explicitly unsupported; Default/Disabled supported |
| Accessibility evidence | Canvas image/transform controls and Layers/inspector editing; DOM exposes named controls | Named shadow controls, visible label and paragraph header | Actual native Email field/Button and Command-A/q/a keyboard entry |
| Cost | Existing editor; standalone semantic fixture is 3,044 bytes | Additional runtime is 417,029 bytes raw, 68,237 per-file Brotli bytes | Signed fixed app is 255,204 bytes plus a 33,512-byte launcher; system frameworks excluded |

The source Card is at (20,20), 360 × 460; Input is 260 × 56 and Button
180 × 44. The real web POC Card is 360 × 265.98; Input is 310 × 70.19 and
Button 156.05 × 43. Native screenshots likewise show different padding and
control layout. The experiments demonstrate executable control behavior;
they do not preserve the full authored scene's layout/style contract.

The production editor at the baseline recorded source ships 1,620,229 raw asset bytes, including
fonts/chrome; per-file Brotli totals 830,240 bytes. The experiment host adds
91,659 raw bytes (22,423 Brotli bytes). These are all shipped assets, not
initial-load bytes or whole-process memory. OS SwiftUI disk cost is excluded.

Thirty sequential warm updates per path completed at approximately 33–36 ms
for the three browser paths and 58–60 ms for native PNG replies on this local
machine. Each browser path includes two animation-frame opportunities; native
includes an intentional 50 ms snapshot scheduling wait plus PNG encoding.
Canvas also includes the CRDT transaction; DOM receives an immutable feed;
web includes MessageChannel/Lit work. These different boundaries cannot rank
input latency, physical presentation or FPS. Raw samples and definitions
are retained; this small fixture does not establish performance at scale.

## Authored-scene follow-up

The original intrinsic-layout mismatch above is retained as source-bound
baseline evidence. The follow-up uses the actual editor's settled Canvas
model to project resolved geometry, parent identities, named slots, bound
solid styles and local overrides through semantic DOM, actual pinned Web
Awesome and sandboxed SwiftUI. Nine source states pass the unchanged
0.1-point outer-box tolerance, including inspector edit/undo, variants,
fractional borders, nested slots/rotations and restoration. Native Primary
is explicitly unsupported, without a substituted screenshot. Actual Canvas
and native raster paint and package shadow-base paint verify supported
overrides. The production inspector identifies semantic/package differences
and unsupported copy/preview properties.

Reproduce the current supported scene comparison with:

```sh
bun prototypes/library-preview/server-owner-test.ts --trust-native-fixture --scene
```

[Current report and source-bound evidence](../reviews/library-scene-comparison-2026-10-02/README.md)
retain each actual capture, contract, geometry, accessibility observation,
instrumented completion sample and fixture asset cost. Historical physical
native input remains at its original recorded source in the separate native
proof. New timing observations have different completion boundaries from the
props-only baseline and cannot be combined or used to rank physical input
latency/FPS. Control chrome, glyphs and focus paint remain platform-specific.

Decision: continue the explicitly trusted supported scene experiment.
Production integration and arbitrary imported-source execution remain NO-GO.
The supported follow-up is implemented locally; exact-head review/CI,
validated dependency integration and verified main delivery remain required.

## What to build and what to retain

Retain the authoritative Sugar Maple scene, undo/redo, layout and Canvas
authoring interaction. A library-backed renderer must consume a declared
supported projection of resolved geometry, named slots, token/style bindings
and local overrides. It must distinguish fallback appearance from real
package appearance and report unsupported platform variants. #88 records
those concrete requirements and consuming-fixture checks.

Keep real code outside the editor's authority. The web experiment has an
opaque script-only iframe and narrow MessageChannel; native has a separately
signed App Sandbox process with bounded stdin/stdout. Session/revision checks,
opt-in trust, cancellation and explicit unsupported errors remain required.
The fixed native helper's UI and PNG handoff are not yet an interactive native
surface embedded into Canvas.

Before arbitrary source execution or production integration, establish the
actual native bridge boundary and stronger hostile-source isolation. The web
iframe is not CPU/process isolation, and navigation is outside its tested
fetch restriction. Native RSS supervision is sampled, CPU is per process,
and canary probes are not a universal OS audit. Full VoiceOver, physical
presentation/input latency and whole-product memory remain wider #21 work.
