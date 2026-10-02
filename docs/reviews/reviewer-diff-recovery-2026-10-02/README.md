# Reviewer diff recovery

Source `fd33752e7d033933ca7b891be89577c4c75e5e98` retrieves exact commit trees in an isolated temporary bare repository, avoiding GitHub's 20,000-line full-diff API limit. It preserves complete shipping-source hunks, including executable prototypes, under the existing 350,000-character payload budget. Response bodies and credentials stay out of diagnostics; the operation/status remain actionable. Session observation/recovery policy is unchanged.

All 38 focused regression tests, typecheck and the production action bundle pass locally on pinned Node 26.9.0. The actual authenticated fetch of PR #95's exact base/head returned 46,393 lines / 1,862,238 bytes; all 46 shipping hunks (284,591 characters) are retained, with non-runtime evidence omissions explicitly listed. The selected payload is 349,840 characters. Working checkout and shallow state remain unchanged. See [verification.json](verification.json) for source hashes, exact revisions and retained logs.

Workflow Node 24, fresh exact-head review/CI and successful resulting-main delivery remain required. This retrieval fix does not cancel retained provider sessions or claim that an observation timeout means an agent is terminal.
