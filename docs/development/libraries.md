# Pinned component libraries

Sugar Maple stores declarative library manifests inside the document. Importing a manifest preserves a package identity, exact dependency versions, typed properties, variants, named slots, token mappings and supported platform mappings. The Assets picker inserts editable Button, Input or Card semantic nodes. The inspector displays their identity, source props, variant, local overrides and an explicit version remap.

Use **Assets → Library manifest file** to choose JSON, or paste JSON and select **Validate library**. Validation creates a preview without changing the authored document or history. **Import library** applies one undoable transaction. Cancel clears the preview. The bundled **Preview Web Awesome 3.14.0** example and [`tools/fixtures/library-manifest.json`](../../tools/fixtures/library-manifest.json) use a real non-Maple package.

## Manifest and commands

`manifestVersion: 1` identifies the schema. `revision` versions the mapping independently from `package.version`; the document key is `<id>@<revision>`. A new mapping revision can therefore keep the same pinned package. `dependencies` declares exact package versions. `webStyles` and each component's `web.module` are paths inside that primary package, and `web.symbol` records its actual exported class. A component declares `semanticKind`, size, typed `props`, `slots`, `variants`, `defaultVariant`, an optional web mapping and an optional SwiftUI mapping. Property defaults, variants, enum choices, bounds and semantic bindings are validated together before an import mutates anything.

The fixture is the complete format example. Unknown schema keys, invalid identifiers, arbitrary imports, event-handler attributes, unsupported semantic mappings and same-key metadata collisions fail atomically. Limits are 1 MB per manifest, 100 components, 100 props and 50 variants per component, 50 dependency pins and 50 pinned versions per document. The native 32 MB checkpoint limit includes the complete undo journal.

`transaction.apply` accepts these operations under the existing document/revision/request-ID guard:

```json
{"type":"library.import","manifest":{"...":"complete validated manifest"}}
{"type":"library.insert","key":"web-awesome@1.0.0","component":"Button","pageId":"page-id","x":24,"y":24,"props":{"label":"Save"},"variant":"Default"}
{"type":"library.props","id":"button-id","props":{"disabled":true},"variant":"Disabled"}
{"type":"library.reset","id":"button-id"}
{"type":"library.remap","id":"button-id","key":"web-awesome@1.0.1"}
{"type":"node.update","id":"child-id","patch":{"librarySlot":"footer"}}
```

The first line illustrates the operation envelope; use the complete fixture as `manifest`. Named slots require a library parent that declares the slot. Library prop edits apply declared semantic bindings. Ordinary semantic edits retain the source prop and record a local override; the local value wins in supported output. Reset clears source-prop and local semantic overrides while retaining the selected variant and cross-document token aliases. Editable paste carries the referenced manifests, remaps conflicting token names, and retains identity, props, variant and slots. Scoped reads include the referenced manifests in `references.libraries`.

## Offline use and safe updates

The editor never installs or evaluates imported JavaScript or Swift. The manifest, semantic nodes and local token values are saved inside `.syrup`, so editing, local semantic preview, undo, paste and reopen work without the package or network. A missing manifest leaves an editable semantic node; mapped export fails with an actionable error until its pinned metadata is restored.

Importing a new revision leaves existing instances pinned. Remapping is explicit, preserves compatible props and local overrides, and rejects an unknown variant, removed property, incompatible type or semantic-kind change without partial mutation. Reusing a key with changed metadata is rejected, including during paste. Conflicting package versions in one mapped web export are rejected; remap the relevant instances first.

## Mapped output and supported boundaries

**Mapped web library** (`code.export` target `web-library`) emits HTML with actual custom-element imports and a declaration of exact package dependencies. It needs a consumer bundler; its bare npm imports are not a standalone browser download. The fixture pins `@awesome.me/webawesome@3.14.0` and all 13 direct dependency versions. The isolated consumer additionally commits the full npm lockfile, runs `npm ci --ignore-scripts`, compiles the package's real TypeScript declarations, bundles the generated imports and tests actual `WaButton`, `WaInput` and `WaCard` shadow controls with non-local network requests denied. Card spacing maps through its documented CSS custom property; header/footer slots, input values and disabled states are explicit.

Mapped web export supports fixed sizing and explicitly declared property/CSS bindings. A local style override that lacks a declared mapping fails instead of silently disappearing. Prototype action attributes identify caller-owned actions; the consumer must provide its interaction handlers. The Canvas and ordinary preview render semantic components. Executing the imported package in an isolated product preview remains [#51](https://github.com/zubair-io/Sugar-Maple/issues/51).

**Mapped SwiftUI (macOS)** (`swift-library`) uses explicit `SwiftUI.Button`, `TextField`/`SecureField` and `VStack` adapters. SwiftUI belongs to the platform SDK, so the fixture declares a macOS 14 minimum API baseline rather than an npm-style exact SDK pin. The actual local consumer compiled with Xcode 27.1 / macOS SDK 27.0 and a macOS 14 deployment target, then rendered through `NSHostingView`. The fixture declares macOS support only. Native Button/Input support Default and Disabled variants; Card requires a vertical stack and default/header/footer slots. Unsupported variants, non-semantic property changes, control child slots and Card media/actions slots fail explicitly. iOS, arbitrary Swift modules, and full web/native visual parity remain unverified and outside this mapping.

Primary package references: [Web Awesome documentation](https://webawesome.com/docs/), [Card](https://webawesome.com/docs/components/card), [Input](https://webawesome.com/docs/components/input/).

## Verification

Run `bun test src/web/tests` and `bun run test:e2e` for model and real browser acceptance. `bun tools/library-consumer.ts` runs the isolated pinned web consumer; its first install needs network access, subsequent locked installs can reuse the owned cache. `bun tools/library-native-consumer.ts` compiles and renders the SwiftUI fixture on macOS and is included in `bun tools/native-acceptance.ts`.

For real window/file/restart QA, build the Mac app, quit any owned Library QA app, and run `bun tools/prepare-library-qa.ts`. This creates a separate Debug app, profile and port 48492. `tools/native-library-mcp.ts` refuses any other profile/port; `--verify` compares its complete checkpoint and journal to the baseline, and `--verify-import` proves a real file import added one batch, retained existing nodes and survived undo/redo/autosave. These helpers retain the owned fixture and do not change the user's normal profile. See the [acceptance evidence](../reviews/library-manifests-2026-10-01/README.md) for the exact supported scope and observations.
