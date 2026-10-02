# Maple chrome primitives acceptance — October 1, 2026

Candidate source commits: `4c76bb7` (pinned primitives/fonts and specimen) and `465f49c` (production integration, independent chrome appearance and regression checks). This completes local acceptance for #4; GitHub review, merge and resulting main CI remain delivery gates. PR #68 already merged the source/dependency audit.

The production shell now uses Maple Toolbar, Input, TreeRow and InspectorPanel, alongside Button/Select/Icon and explicitly local Field/Section compositions. The narrow inventory has 52 files (29 exact, 14 adapted, 9 local), from upstream pin `dc6205dbd5ea8031510777e3031abad50cb7e2e7`. This does not claim the complete 171-module catalog. Fonts and original notices are bundled with verified hashes.

## Verified

- Exact model suite: 60 tests, 415 assertions. All 20 browser/consumer suites passed; the new chrome suite also passed against the optimized production bundle.
- Specimen: input/disabled/loading/error states and unique descriptions, overflow/expanded state and Escape focus restoration, nested/disabled tree keyboard activation, tabs and indicator alignment, local fonts, light/dark preference persistence, and a sibling arbitrary authored fixture excluded from chrome utilities.
- Production: creation toolbar guards, layer search/clear, pointer and keyboard Shift-selection, horizontal layer control geometry, inspector Details/Comments tabs, unchanged scene revision/content and exact Canvas pixels across appearance changes. Requests use local assets; no remote fonts/backend/auth bootstrap. Static runtime imports remain vendored closure plus Angular core, and scene/Canvas imports exclude host chrome.
- Native macOS build and native storage/MCP/compiled consumer acceptance passed. An isolated DEBUG QA app with its own support directory and MCP port 48493 exercised the actual WKWebView toolbar, search, clear, keyboard Shift-selection and inspector tabs. Light preference survived normal quit/reopen. Prototype mode disabled all seven creation tools and returning to Design restored them.
- Actual native MCP captures in light and dark have identical 840×716 Canvas RGBA pixels (digest in `theme-verification.json`). Complete document checkpoint including journal and root HTML export remained exactly unchanged at revision 2 with two nodes. Full editor screenshots show the surrounding chrome. This is focused keyboard/AX acceptance, not a complete release VoiceOver audit.
- A git archive of `465f49c` built in an owned isolated checkout with no Maple sibling after frozen dependency install and the source/font inventory guard. Logs retain the existing application stylesheet budget warning (7.29 kB against the 4 kB warning/8 kB error budget); no budget was raised.

Three upstream OFL notices preserve exact original bytes, including original trailing whitespace. All other new text passes the whitespace check. Native capture credentials and profile data are excluded from committed evidence.

See [source/update contract](../../development/maple-chrome.md) and the retained logs/screenshots. Broader registry, release, performance and product roadmap issues remain separately open; this evidence closes only the narrow #4 acceptance after review/merge/main CI.

## Review follow-up

The first exact-head review returned `VERDICT: comment` (session `4518082986331245886`), with warnings about search-clear focus and dynamic tab observers, plus a layer tree tab-stop note. The follow-up returns focus to the real input, refreshes/disconnects tab observers and subscriptions on collection changes/destruction, and gives production Layers a single roving treeitem tab stop. Up/Down/Home/End and parent/child arrow focus navigation preserve the complete document checkpoint and cannot invoke Canvas nudging. New browser regressions exercise search focus, a newly inserted tab resized without changing its row width, removal of that tab, tree focus movement and unchanged history. The initial review remains visible; the changed head requires fresh CI and review.

Follow-up validation: all 20 browser/consumer suites and optimized-bundle chrome acceptance pass; typecheck/source inventory and macOS build pass. Actual isolated native WKWebView search-clear focus and Down/Home tree focus navigation passed; native MCP proves the full checkpoint/journal/export remained exactly unchanged. The QA app was normally quit afterward. Evidence is in the `review-*` logs and `native-review-followup.png`.
