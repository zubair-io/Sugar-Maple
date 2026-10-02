# Maple chrome source and update contract

Sugar Maple vendors a narrow chrome subset from [Maple at `dc6205dbd5ea8031510777e3031abad50cb7e2e7`](https://github.com/zubair-io/Maple/tree/dc6205dbd5ea8031510777e3031abad50cb7e2e7). The production editor does not need a sibling checkout or import Maple's broad public barrel. [`inventory.json`](../../src/web/src/app/chrome/maple/inventory.json) records every vendored TypeScript/template/style file, its local SHA-256, exact upstream path/blob/SHA-256 when present, and whether it is exact, adapted, or a local composition.

The current inventory has 52 source files: 29 exact pinned files, 14 adapted pinned files and 9 local compositions/styles. The pinned upstream has 171 `.component.ts` modules under its UI directory; that count describes source modules, not claimed catalog/platform parity.

| Current chrome surface | Provenance and contract |
| --- | --- |
| MuiButton | Adapted pinned Button/template/style. Retains primary/secondary/ghost/destructive, sizing, disabled/loading, native-button activation and ARIA forwarding. Scoped SCSS retains the adapted Button geometry and resolves chrome palette roles through CSS variables. |
| MuiSelect | Adapted pinned single-choice control with local SCSS. Retains the parent-owned value, rejection of missing/disabled options, native popup/keyboard semantics and `valueChange`. The local chevron/geometry adapts WKWebView styling. |
| MuiIcon / MapleIcon / registry / glyph helpers | Pinned files with a local registry adaptation adding seven design-tool glyphs. Original Maple glyphs remain intact. Runtime dependencies stay inside the vendored icon closure plus Angular core. |
| Generated tokens | Exact pinned `_ui-tokens.scss`. These are host chrome tokens, not document token seeds or imported design-system definitions. |
| MuiField / MuiSection | Local Sugar Maple compositions/styles using the pinned chrome tokens. They are not copies of upstream MuiFormField, MuiSettingsSection or MuiInspectorPanel. |

The machine inventory is the authoritative per-file classification; some files within a component remain exact while its other files are adapted. The script inspects TypeScript import/re-export declarations, including side-effect imports, rejects dynamic/require imports in the audited folders, checks relative chrome imports remain in that closure, and verifies scene-model/Canvas imports exclude Maple chrome. It is a static dependency/source check. It does not replace runtime cold-launch, network, theme, accessibility or visual acceptance.

## Required primitives and chrome boundary

The narrow `sugar-maple-chrome.ts` entry point exports Button, Select, Input, Toolbar, TreeRow, InspectorPanel, Icon and the local Field/Section compositions. Their transitive closure adds ActionButton, Divider, Text, Badge, Spinner, Chevron, Popover, PageHeader, Tabs, activation handling and row interaction styles. No broad upstream application barrel is imported.

Production uses Toolbar for creation tools, TreeRow for layer selection, Input for layer search, and InspectorPanel for projected Details/Comments. Toolbar actions retain native-button names/disabled guards; design glyphs and optional icon-only labels keep the toolbar compact. TreeRow retains `pressed` and adds `activated` carrying pointer/keyboard modifiers for Shift-selection, plus selected/disabled/level ARIA. Input error descriptions receive unique per-instance IDs. Popover Escape returns focus to its trigger. Tabs measure after parent-driven selection and observe sizes, so the indicator follows comments navigation and bundled font layout.

`#chrome-specimen` boots only the specimen component, without EditorService, document state or the authoring/native bridge. It exercises states and projected content alongside an authored fixture without the `.maple-chrome` marker. Utilities use Tailwind's selector strategy (`tailwind.chrome.config.cjs`), avoiding a dependency on CSS `@scope` support and the critical-style parser warnings it caused. No Tailwind preflight is imported. Do not mark the app root, Canvas renderer or arbitrary preview content as chrome.

Dark uses the pinned palette. Light is an explicit local chrome adaptation in `tailwind.css`; it is not described as an upstream light palette. Chrome appearance is a local storage preference independent of scene state/undo. Palette overrides apply only to marked chrome descendants, and the Canvas mat and authored scene remain independent. The browser acceptance test verifies equal document revision/content and exact rendered Canvas pixels after a theme switch, not merely equal export text.

This is a narrow editor subset, not all 171 upstream components or platform catalog parity. Native acceptance and the isolated no-sibling build must pass before closing #4. [`chrome-e2e.ts`](../../src/web/tests/chrome-e2e.ts) runs in the regular browser gate and also accepts `SUGAR_MAPLE_TEST_URL` for the optimized static bundle.

## Updating the pin or adapting files

1. Inspect the intended exact upstream commit read-only, its UI contracts, complete import closure and notices. Update the explicit revision in the inventory tool only as part of a reviewed source update. Do not copy the upstream public barrel or initialize its application services.
2. Preserve original source headers and provenance. Review changes to Button/Select input/output/disabled/keyboard/ARIA behavior and all transitive styles/icons. Keep local Field/Section compositions identified as local; do not imply they fulfill the missing upstream primitives.
3. Run `bun tools/maple-inventory.ts --refresh --source /path/to/Maple`. This reads git objects at the exact pin, without checking out or editing that repository. Inspect changed source classifications and hashes. Routine CI runs `bun tools/maple-inventory.ts` against the committed inventory and needs no upstream checkout.
4. Build from an isolated Sugar Maple checkout with no `../_Maple`, then run browser/native specimen and editor checks. Verify keyboard/disabled/loading/overflow/tree/tab behavior in supported themes, no backend/auth/remote-font initialization, and that a non-Maple authored fixture and its exports are unchanged by chrome-theme changes. Retain results before closing #4.

## Notices and fonts

The exact inspected upstream commit has no root `LICENSE`, `COPYING` or `NOTICE` file matching those standard names; the inventory records this observed absence. No license is invented for those sources. Retain their original headers, source URLs, exact revision, adaptation description and any notices present in a future reviewed revision. This audit does not assert a third-party distribution license for the entire Maple repository.

Chrome bundles pinned Lato regular/bold, Merriweather bold and JetBrains Mono regular with their original three OFL notices. [`maple-provenance.json`](../../src/web/public/fonts/maple-provenance.json) records source paths, blobs and hashes; the inventory gate verifies every font/notice hash without reading the sibling checkout.

The authored Canvas font remains separately tracked as Inter 4.1, aliased as Maple Sans in CSS. [`public/fonts/provenance.json`](../../src/web/public/fonts/provenance.json) records its official source and SHA-256, and [`Inter-LICENSE.txt`](../../src/web/public/fonts/Inter-LICENSE.txt) retains SIL OFL 1.1. It is a local bundled font, not a remote font request or evidence that the whole Maple font/catalog surface is integrated.
