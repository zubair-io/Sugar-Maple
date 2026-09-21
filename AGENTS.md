# Sugar Maple

A local-first visual UI design, prototyping and developer-handoff workbench. The shared Angular editor renders HTML/CSS and inline SVG, runs in a browser and is bundled inside a macOS WKWebView shell. Documents are local `.syrup` packages. Human editing and MCP clients operate on the same document through validated commands.

Adapted from `../_Maple/AGENTS.md` at revision `dc6205dbd5ea8031510777e3031abad50cb7e2e7`. This file carries forward the applicable engineering conventions and replaces product-specific implementation instructions with Sugar Maple's architecture.

## Product and architecture sources

- `product.md` describes the broader product requirements.
- `docs/design/editor-ui.md` defines the desktop shell geometry, three modes, panels, controls, status states and UI acceptance criteria. Read it before changing editor layout.
- `docs/planning/architecture.md` records the scoped architecture and amendments. Where the older RFC or PRD differs, use this architecture document and the current issue acceptance criteria.
- `docs/rfcs/RFC-2026-SYRUP-001.md` provides the original feature context with rendering amendments; it is not a complete wire-protocol specification.
- [MVP tracker #1](https://github.com/zubair-io/Sugar-Maple/issues/1) is the delivery checklist. Follow issue dependencies and acceptance criteria.
- [Issue #20](https://github.com/zubair-io/Sugar-Maple/issues/20) establishes the early MCP/editor loop. Read its current body before changing the bridge or command API.

## Architectural invariants

1. **Local-first, offline from first launch.** Bundle application assets and fonts. Core editing, layout, preview and handoff must work without a server account or outbound network. Report unsaved work and persistence failures accurately.
2. **Host UI and document UI are separate.** `_Maple` supplies only editor chrome: toolbars, panels, trees, inspectors, icons and host theme tokens. Use narrow, pinned, tree-shaken dependencies. The scene model, canvas projection and portable exporters must not import host component implementations or application services.
3. **HTML/CSS + inline SVG.** Standard semantic controls, typography, frames and stacks use HTML/CSS. Vector paths, connectors and selection affordances use inline SVG. Preserve mixed stacking, clipping, coordinate transforms and editor-versus-preview input routing.
4. **One authoritative document.** DOM, SVG, inspector state and exported code are projections of the scene graph. Never scrape the rendered DOM to recover authored semantics. Stable node IDs, parent/order, layout rules and optional design-system bindings belong in the document.
5. **One command path.** Mouse, keyboard, paste and MCP enter the same validated dispatcher. The MCP host forwards requests to the active editor-owned document; it must not maintain a separate writable document. Reject invalid batches before mutation and keep each user gesture or agent batch one undo step.
6. **Document tokens belong to the design.** Host theme changes must not alter authored content. Optional Maple seeds and mapped component symbols are explicit document data. Unmapped and user-created components must remain renderable and exportable.
7. **Portable handoff.** Default exports are clean Angular, semantic HTML with Tailwind 4 or CSS, idiomatic SwiftUI and DTCG tokens. Optional library-specific snippets declare dependencies. Validate output in real consuming fixtures; report unsupported constructs explicitly.
8. **Choose the CRDT with evidence.** Yjs is provisional. Issue #6 compares Automerge against the same editing, undo, concurrency, recovery and performance fixtures before durable storage is finalized. Keep CRDT-specific objects inside the document store and ship one selected implementation.
9. **Measure correctness and performance.** Browser and WKWebView must agree on supported layout and interaction semantics within documented fixture tolerances. Record reference hardware and measured budgets; do not claim unmeasured targets or silently relax gates.

## Finish the scoped work

Carry forward Maple's completion and YAGNI principles:

- Ship working behavior. Do not leave fake data, empty handlers, stubs or TODOs presented as completed functionality.
- Incremental staging is allowed when tracked by an issue and explicit about what is available. Advertise only implemented MCP capabilities. A session-local first slice must say that its document is unsaved.
- Complete the authorized scope and its required checks. A first subtask is a checkpoint, not completion of an entire requested feature. Report genuine blockers accurately.
- Build for current requirements. Avoid speculative frameworks, renderer plugins, generic configuration systems or unused abstraction layers. The document-store and command boundaries exist for concrete current callers.
- Preserve existing work. Do not overwrite another contributor's edits or replace an external issue body without reading its current state.

## MCP development contract

Start with the working loop in #20 before advanced editor features:

1. Launch the Mac app with its embedded Swift MCP server and minimal bundled editor using one documented development workflow.
2. Connect through Streamable HTTP at `127.0.0.1:48480` or the stdio adapter to the same host/session.
3. Discover capabilities, create an artboard/rectangle/text batch and obtain node IDs, transaction ID and revision.
4. See those elements in the actual editor; make a pointer edit and read it back through MCP.
5. Capture a revision-bound rendered image and undo/redo the agent operation without erasing unrelated human edits.

Version input/output schemas and publish examples. Define coordinates, units, defaults, batch semantics, retries, selection and document/session targeting. Separate committed, rendered and durable status. Wait for layout and fonts before returning an image; report a superseded revision explicitly.

Define loading, disconnected, stale-revision, wrong-document and timeout errors. Authenticate the local HTTP endpoint, validate Origin/Host, reject non-loopback binding and keep tokens out of logs. Port conflicts must be actionable. Stdout is reserved for protocol traffic in stdio mode.

Every later editor feature adds its command, tool exposure, usage example and real transport test as it lands. [Issue #27](https://github.com/zubair-io/Sugar-Maple/issues/27) extends this same loop with native packaging and full feature coverage. No arbitrary pasted source execution or privileged filesystem access from preview content.

## Repository layout and current status

Currently present:

```text
AGENTS.md
product.md
docs/planning/architecture.md
docs/planning/README.md
docs/rfcs/RFC-2026-SYRUP-001.md
src/apple/Sugar Maple.xcodeproj/
src/apple/Sugar Maple/
```

The app is currently an Xcode scaffold. The Angular workspace, document packages, MCP server and their test commands are planned work, not existing implementations. Update this section and add runnable build instructions as those targets land. Do not copy sibling repository commands or assume their toolchain/paths are installed here.

`../_Maple` and `../Just-Maple` are reference sources. Neither sibling checkout may be required for a clean CI/release build. Record provenance and dependency versions when porting code, along with applicable notices.

## Implementation conventions

- Prefer functional, immutable transformations, `const` in TypeScript and `let` in Swift where mutation is unnecessary. Keep state transitions explicit.
- Angular: standalone components, signals, `input()`/`output()`, separate `.ts`/`.html`/`.scss`, service-level observables where appropriate, and focused component view models.
- Swift: use `@Observable` where appropriate, actor-isolated I/O and cancellation/generation checks for asynchronous results. Keep native capabilities behind the typed bridge.
- Prefer focused Angular libraries and Swift packages when a real shared responsibility warrants them. Avoid accumulating unrelated logic in app entry points or oversized files.
- Remove generator hello-world/Playground scaffolding when replacing it with working functionality.
- Single-source shared schemas and constants. Validate or generate the Swift/TypeScript bridge representations so they cannot silently drift.
- Keep product settings in the application's settings model when implemented. Reserve environment variables for development/bootstrap and secrets; do not import a sibling application's database-backed settings infrastructure.
- Key caches by the data and revision they derive from, document invalidation, and cancel stale asynchronous work.
- Use visible focus, accessible names and keyboard alternatives. Prefer accessibility/DOM locators over coordinate-based UI automation where available.

## Build and verification

Inspect available Xcode targets and schemes before choosing a build command:

```sh
xcodebuild -list -project "src/apple/Sugar Maple.xcodeproj"
```

For macOS, use a macOS destination, not an iOS simulator identifier. Audit scaffold deployment targets during bootstrap. The existing target uses generated Info.plist settings; preserve that setup and use `INFOPLIST_KEY_*` settings rather than adding a conflicting Info.plist.

When the workspace is implemented, document and run its actual install, dev, type-check, build and test scripts. Keep lockfiles and reproducible tool versions. Never report planned commands as executed checks.

Testing should cover the behavior that can fail:

- Round-trip real `.syrup` packages in temporary directories; use real IndexedDB for browser persistence checks. Mocks alone do not prove durability or recovery.
- Test schema migrations, parent cycles, coordinate transforms, batching, undo origins, retry idempotency and concurrent edits.
- Exercise MCP over its real transports against the live editor; check document values and visible output. A successful protocol response alone is insufficient.
- Run browser and native interaction checks for the changed surface. Use screenshots as visual evidence alongside semantic assertions.
- Compile generated code in isolated consumers, including consumers with no Maple dependency.
- Record missing fixtures, skipped checks and unavailable tools as limitations, not passing evidence.

## Git and pull requests

- Repository: `git@github.com:zubair-io/Sugar-Maple.git`; base branch: `main`.
- Every implementation PR references its issue and includes `Closes #N` or `Fixes #N` when it completes that issue. Partial work must state what remains and must not prematurely close the whole issue.
- Open PRs ready for review when ready, following Maple's convention.
- Keep branches linear and prefer rebase-and-merge when repository settings permit it. Before merging, validate against the current base and require applicable checks to finish green. Resolve broken base checks rather than dismissing them as unrelated.
- Do not commit local issue Markdown exports: `docs/planning/issues/` and `docs/planning/all-issues.md`. Local publishing scripts, issue-map/backlog data and verification output are also ignored. Do not force-add them.
- Keep Xcode user state, caches, build output, credentials and local environment files out of Git. Preserve `.gitignore` exclusions.
- Commit and push only within the user's authorized scope; editing this guidance does not authorize a push or merge.
