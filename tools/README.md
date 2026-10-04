# Sugar Maple development tools

These programs support the product's build and verification. They are not copied
into the app. Run commands from the repository root after
`bun install --frozen-lockfile`; see the root README and development documents
for prerequisites and the scope of each check.

| Purpose | Entry points and related fixtures |
| --- | --- |
| Build the bundled editor and Mac host | `build-editor.sh`, `build-mac.ts` |
| Connect to the same native document through MCP | `mcp-stdio.ts`, `mcp-config.ts`, `mcp-smoke.ts`, `mcp-integration.ts` and feature-specific `mcp-*-test.ts` |
| Verify real native persistence, transport, clipboard and preview boundaries | `native-acceptance.ts`, the Swift native fixtures, and feature-specific `native-*.ts` runners |
| Exercise the editor in Chrome and isolated native QA copies | `browser-acceptance.ts`, `prepare-*-qa.ts`, `owned-browser-server.ts` and `*-page.js` fixtures |
| Compile exported code in actual consumers | `*-export-test.ts`, `vector-export-consumer.swift`, `library-consumer.ts`, `library-native-consumer.ts` and `fixtures/` |
| Compare the trusted library preview experiment | `library-preview-acceptance.ts`, `native-library-preview-acceptance.ts`, `library-preview-comparison.ts` and `library-preview-comparison.ts --scene` |
| Measure renderer/layout behavior and inspect pinned chrome provenance | `*-benchmark.ts`, `native-canvas-benchmark.swift`, `maple-inventory.ts` |
| Reproduce the editable reference drawing used by gradient/vector QA | `draw-maple-reference.ts` |

Fixture labels and scenes are test inputs. Native QA copies use separate bundle
identifiers and profiles; use the documented preparation tools rather than
pointing destructive acceptance fixtures at working documents. MCP clients read
the running app's private per-launch token locally and do not print it.

The library experiment accepts only the explicitly trusted, pinned fixtures
described in its README. It does not approve arbitrary JavaScript or Swift
execution in the shipping editor. Dependency caches, build output, credentials
and local acceptance results belong in ignored directories. The unrelated
account-wide Jules session deletion utility was removed; the repository's
review action and exact-session recovery remain under `.github`.
