Maple UI chrome subset ported from zubair-io/Maple at dc6205dbd5ea8031510777e3031abad50cb7e2e7.
Includes MuiButton, MuiSelect, MuiIcon, MapleIcon and generated host token values. MuiField and MuiSection are local Sugar Maple compositions, not ported upstream Field/Inspector primitives. No photo services or runtime processing dependencies. The canvas does not import this directory.

The per-file source, upstream blob, SHA-256 and adaptation inventory is in `inventory.json`. See [the complete source/update/notices contract](../../../../../../docs/development/maple-chrome.md). Run `bun tools/maple-inventory.ts` from the repository root to check the committed inventory and static dependency boundary without requiring an upstream checkout. Toolbar/tree/inspector and explicit light/dark specimen acceptance remain issue #4.


Sugar Maple does not run Maple's Tailwind utility build. MuiButton and MuiSelect therefore include component-scoped SCSS equivalents of their pinned template utilities, using the same generated Maple tokens, radii, fonts, padding and focus colors. MuiSelect retains Maple's native single-choice keyboard/popup behavior and validated valueChange contract. Editor remove/dismiss controls use MuiButton ghost/iconOnly with the Maple drawer-close SVG. These adaptations are confined to chrome; scene controls and exports are unchanged.

MuiSelect suppresses the platform bezel and overlays Maple's chevron-down icon so WKWebView honors the same 44px control geometry as Chromium; the underlying native select semantics are retained.
