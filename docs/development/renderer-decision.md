# Renderer decision — October 1, 2026

Status: **Canvas Design / semantic DOM Preview is implemented; the release performance gate remains open (#2).** This records the user-requested amendment to the initial HTML/SVG Design proposal. The shipped renderer decision is not waiting on an alternative-renderer rewrite.

## Decision and source of truth

Design uses the actual vendored Just-Maple Whiteboard CanvasComponent and its camera/input/scheduling seam, pinned at `38c2e6793b4602418b669909865d2292d43a842d`. The Sugar Maple painter consumes a retained layout projection. Canvas, DOM preview, MCP bounds/capture and exporters consume the same authored scene. Rendered pixels and DOM never become a second writable document. [The delivery record](canvas-port.md) identifies source provenance, parity fixtures, native MCP verification, and the original QA-01–QA-10 fixes.

Semantic DOM controls remain in isolated prototype preview and portable web exports. SwiftUI is a separately validated export target. `_Maple` supplies the authoring chrome; its theme and runtime primitives do not enter the authored Canvas or DOM projection. Optional production-library manifests are document metadata and explicit export mappings; executable library previews are a separate #51 PoC.

The initial issue #2 HTML/SVG recommendation and RFC renderer diagrams are historical planning. The requested Just-Maple prototype was integrated in #45 after browser/native workflow and geometry checks. This is an explicit architectural amendment, not evidence that Canvas outperforms every possible HTML/SVG implementation. No comparable standalone SVG-only or HTML-only performance implementation was delivered.

## Consequences and outstanding requirements

Canvas allows one culled, DPR-aware design surface and reuses the existing Whiteboard camera and pointer contract. It also requires application-owned picking, selection, text editing and keyboard/accessibility affordances. The DOM preview preserves real interactive controls. Current shared geometry covers free, horizontal, vertical and bounded grid layout, clipping, rotations, fixed/fill/hug/percent sizing and measured typography. Existing browser and native parity evidence does not complete native IME/caret behavior, advanced vectors, all-direction gestures, snapping or the release VoiceOver workflow (#8/#9/#21).

The indexed Layers tree is still fully mounted. Its DOM growth and reactive work must be measured separately from culled Canvas painting. Document recovery, validation, history replay and full-scene reads are also separate costs; a warm painter flush cannot establish load time or memory at scale.

## Reproducible engine measurements

Run `bun run build:web` followed by `bun tools/canvas-engine-benchmark.ts` on a visible macOS desktop with Chrome installed. The runner owns an ephemeral loopback server, fresh Chrome contexts, a separately identified WKWebView harness and in-memory native fixture bridge. It does not use the user's running app, general clipboard, support folder or MCP port.

Both engines load the same generated checkpoint: 1,000 total / 200 visible mixed nodes, then a 10,000-total diagnostic with the same visible work. The fixture has grid frames, multiline text, buttons, inputs, ellipses, rectangles, real decoded images and paths. Every visible image is pixel-checked. The normal wheel handler and animation-frame scheduler perform pan/zoom; the benchmark never calls the synchronous flush. It also opens the full Layers panel and measures pan again. All camera phases must leave the authored checkpoint/history unchanged. Chrome additionally receives a trusted Playwright wheel; its timing is not mixed into the shared synthetic samples.

Raw callback intervals, synthetic-event-to-observed-paint samples, CPU paint durations, load observations, scoped memory, screenshots, Chrome traces and bundle/source hashes go to ignored `build/canvas-engine-benchmark`. `run-state.json` must say `passed`; an interrupted/failed run does not constitute complete evidence. Captured data is summarized in the accompanying review record.

`requestAnimationFrame` callbacks occur before repaint; they do not prove physical presentation or hardware input latency ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)). Chrome pipeline traces are retained for compositor analysis. WKWebView's native bridge in this harness supplies a fixed checkpoint and omits real disk/MCP/clipboard costs. Chrome JS heap/RSS and the WK harness owner's peak RSS have different scopes; the latter excludes WebKit content/GPU/network processes and includes fixture scaffolding.

## Release decision

Continue the implemented Canvas/DOM architecture while resolving measured editor costs and missing authoring affordances. **The proposed p95 ≤16.7 ms release gate remains unproven, and #2 remains open.** A full gate still needs an agreed reference machine/display, repeated representative workload including real native recovery, whole-process memory attribution and compositor/presentation evidence in both engines. The 10,000-node case remains diagnostic. #21 owns the complete offline release workflow and distribution evidence.
