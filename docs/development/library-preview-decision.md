# Real-library preview decision — October 2, 2026

The web and native experiments render real controls with a bounded typed
contract. The decision is **GO for continued opt-in fixed-source experiments;
NO-GO for production integration or replacing Canvas authoring**.

Discovery #51 remains open until its candidates and comparison are reviewed,
merged and verified on main. Web #86 and native #87 are separate candidates.
The production projection work is now precisely tracked in #88, with parents
#25/#26 and related native fidelity #17 and token work #11. A successful
discovery does not close these implementation gaps.

## Evidence and reproduction

Use Bun 1.4.2 and macOS with the macOS 14 SwiftUI API baseline. With Chrome
installed, run:

```sh
bun tools/library-preview-comparison.ts --trust-native-fixture
```

The command checks the pinned consumer/cache, builds and gates the web
fixture, runs the actual Canvas/DOM/package/native comparison, builds the
current production editor, measures assets and generates/tests the report.
It owns a development server only when one is not already available. The
macOS Editor CI job explicitly installs Chrome and runs this comparison after
the full native suite. Native human-event evidence is a separately recorded
real UI run; the comparison does not simulate or repeat that input test.

Source-bound raw measurements, four actual rendered images, ARIA snapshots,
asset hashes, report and logs live in
`docs/reviews/library-preview-comparison-2026-10-02`. Run
`bun prototypes/library-preview/serve-report.ts` to inspect the committed
interactive report locally. Web and native trust/unsupported policies are in
`prototypes/library-preview/README.md` and `native/README.md`.

## Comparison

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

The current production editor ships 1,620,229 raw asset bytes, including
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
