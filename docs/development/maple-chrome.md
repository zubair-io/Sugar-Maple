# Maple chrome source and update contract

Sugar Maple vendors a narrow chrome subset from [Maple at `dc6205dbd5ea8031510777e3031abad50cb7e2e7`](https://github.com/zubair-io/Maple/tree/dc6205dbd5ea8031510777e3031abad50cb7e2e7). The production editor does not need a sibling checkout or import Maple's broad public barrel. [`inventory.json`](../../src/web/src/app/chrome/maple/inventory.json) records every vendored TypeScript/template/style file, its local SHA-256, exact upstream path/blob/SHA-256 when present, and whether it is exact, adapted, or a local composition.

The current inventory has 19 source files: 10 exact pinned files, 3 adapted pinned files and 6 local compositions/styles. The pinned upstream has 171 `.component.ts` modules under its UI directory; that count describes source modules, not claimed catalog/platform parity.

| Current chrome surface | Provenance and contract |
| --- | --- |
| MuiButton | Adapted pinned Button/template/style. Retains primary/secondary/ghost/destructive, sizing, disabled/loading, native-button activation and ARIA forwarding. Scoped SCSS implements the pinned utility styles because Sugar Maple does not run the upstream Tailwind utility build. |
| MuiSelect | Adapted pinned single-choice control with local SCSS. Retains the parent-owned value, rejection of missing/disabled options, native popup/keyboard semantics and `valueChange`. The local chevron/geometry adapts WKWebView styling. |
| MuiIcon / MapleIcon / registry / glyph helpers | Exact pinned files. Runtime dependencies stay inside the vendored icon closure plus Angular core. |
| Generated tokens | Exact pinned `_ui-tokens.scss`. These are host chrome tokens, not document token seeds or imported design-system definitions. |
| MuiField / MuiSection | Local Sugar Maple compositions/styles using the pinned chrome tokens. They are not copies of upstream MuiFormField, MuiSettingsSection or MuiInspectorPanel. |

The machine inventory is the authoritative per-file classification; some files within a component remain exact while its other files are adapted. The script inspects TypeScript import/re-export declarations, including side-effect imports, rejects dynamic/require imports in the audited folders, checks relative chrome imports remain in that closure, and verifies scene-model/Canvas imports exclude Maple chrome. It is a static dependency/source check. It does not replace runtime cold-launch, network, theme, accessibility or visual acceptance.

## Remaining #4 work

The production shell still needs the actual pinned toolbar, tree and inspector contracts, an explicit isolated chrome specimen, and verified light/dark behavior. Concrete upstream entry points and transitive UI dependencies are:

| Primitive | Upstream module | Dependencies to review/port together |
| --- | --- | --- |
| Input | `ui/input/mui-input.component.ts` | Inspect its complete form/value/focus contract rather than renaming MuiField. |
| Toolbar | `ui/toolbar/mui-toolbar.component.ts` | ActionButton, Divider, Icon, Text and Popover; preserve overflow, disabled behavior and `itemSelected`. |
| Tree row | `ui/tree-row/mui-tree-row.component.ts` | Badge, Icon, Spinner, Text, Chevron and activation-key helper; preserve expansion, depth, busy/error states, keyboard activation and ARIA. |
| Inspector | `ui/inspector-panel/mui-inspector-panel.component.ts` | PageHeader and Tabs; preserve projected content, tab model, back/more events and accessible tab behavior. |

Those modules are not vendored by this inventory change. Complete their transitive closure without importing RAW/photo processing, auth/application services or the upstream public barrel. The current generated SCSS palette and local compositions use the pinned dark colors; a passing dark screenshot does not establish a supported light mode. Scene colors/exports must remain independent when the host theme changes.

## Updating the pin or adapting files

1. Inspect the intended exact upstream commit read-only, its UI contracts, complete import closure and notices. Update the explicit revision in the inventory tool only as part of a reviewed source update. Do not copy the upstream public barrel or initialize its application services.
2. Preserve original source headers and provenance. Review changes to Button/Select input/output/disabled/keyboard/ARIA behavior and all transitive styles/icons. Keep local Field/Section compositions identified as local; do not imply they fulfill the missing upstream primitives.
3. Run `bun tools/maple-inventory.ts --refresh --source /path/to/Maple`. This reads git objects at the exact pin, without checking out or editing that repository. Inspect changed source classifications and hashes. Routine CI runs `bun tools/maple-inventory.ts` against the committed inventory and needs no upstream checkout.
4. Build from an isolated Sugar Maple checkout with no `../_Maple`, then run browser/native specimen and editor checks. Verify keyboard/disabled/loading/overflow/tree/tab behavior in supported themes, no backend/auth/remote-font initialization, and that a non-Maple authored fixture and its exports are unchanged by chrome-theme changes. Retain results before closing #4.

## Notices and fonts

The exact inspected upstream commit has no root `LICENSE`, `COPYING` or `NOTICE` file matching those standard names; the inventory records this observed absence. No license is invented for those sources. Retain their original headers, source URLs, exact revision, adaptation description and any notices present in a future reviewed revision. This audit does not assert a third-party distribution license for the entire Maple repository.

The bundled application font is separately tracked as Inter 4.1, aliased as Maple Sans in CSS. [`public/fonts/provenance.json`](../../src/web/public/fonts/provenance.json) records its official source and SHA-256, and [`Inter-LICENSE.txt`](../../src/web/public/fonts/Inter-LICENSE.txt) retains SIL OFL 1.1. It is a local bundled font, not a remote font request or evidence that the whole Maple font/catalog surface is integrated.
