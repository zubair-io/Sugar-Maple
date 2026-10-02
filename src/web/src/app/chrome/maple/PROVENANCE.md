Maple UI chrome subset ported from zubair-io/Maple at dc6205dbd5ea8031510777e3031abad50cb7e2e7.

The narrow entry point includes pinned Button, Select, Input, Toolbar, TreeRow, InspectorPanel and their complete transitive UI/style/icon dependencies. MuiField and MuiSection remain local Sugar Maple compositions, not ported upstream Field/Inspector primitives. There are no photo services or runtime processing dependencies. Canvas/model code does not import this directory.

`inventory.json` records every source file's exact source path/blob, local/upstream SHA-256 and classification. [The source/update/notices contract](../../../../../../docs/development/maple-chrome.md) documents the additive editor adapters, scoped utility pipeline, appearance boundary and actual catalog gaps. Run `bun tools/maple-inventory.ts` from the repository root; CI requires no sibling checkout and verifies pinned local font/notices as well.

Local adapters retain Button/Select native semantics and geometry; optional compact toolbar labels and seven design glyphs; TreeRow modifier-aware activation and selected/disabled/level ARIA; unique Input error descriptions; Popover Escape focus restoration; and Tabs indicator measurement for parent selection/font/size changes. Component-scoped SCSS uses the shared chrome role variables. Light is a local chrome palette, dark is the pinned palette. Document tokens, authored controls, fonts and exports are independent.

Pinned Lato, Merriweather and JetBrains Mono files and their original OFL notices are in `public/fonts/maple-provenance.json`. Existing Inter 4.1 remains the separately tracked Canvas font. No remote font request is required.
