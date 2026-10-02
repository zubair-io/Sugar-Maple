# Scene preview dependency integration

The scene candidate is rebased onto PR #89 head `9a87bb641361f7008721e44111d73cfcc8c21970`, incorporating vector handoff, camera mapping and pinned-Node packaging fixes. Original scene and cleanup evidence remains at its recorded commits.

At source `17c268c6060a4a63110ade47c17f08338b698975`, 136 model tests / 2,177 assertions, typecheck, all 30 browser/consumer suites, production Mac packaging/signing and full native acceptance exited 0. Native acceptance includes 23 compiled/rendered SwiftUI vector consumers, 20 WK drawing cases and both camera handoffs. The fresh owned-editor scene comparison passed nine authored states at the unchanged 0.1 logical-point tolerance. Its unrelated-port canary was untouched and no owned descendants remained.

Actual normal native cleanup finished in about 0.30 seconds. A real intentionally leaked listener was rejected at the unchanged 30-second cleanup deadline. Full comparison success was required before injected shutdown. Preparation and native build/runtime budgets retain their documented separate scopes.

Logs, current comparison report/captures and source/artifact hashes are in [verification.json](verification.json). Previous physical-input and native reset evidence retains its original source; these automated gates do not prove hardware IME, whole-product VoiceOver coverage or arbitrary library import. Fresh final-head review/CI and verified resulting-main delivery remain pending.
