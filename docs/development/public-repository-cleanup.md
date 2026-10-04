# Public repository cleanup

The cleanup tracked in [#135](https://github.com/zubair-io/Sugar-Maple/issues/135)
keeps the shipping product and its reproducible verification, while removing
separate product artifacts and superseded code.

| Path | Decision | Reason |
| --- | --- | --- |
| `designs/just-maple/` | Remove, including from writable branch/tag history | Separate Just Maple design handoff, screenshots and editable documents; about 50 MB; no shipping/build/CI dependency |
| `prototypes/whiteboard-ui/` | Remove, including from writable branch/tag history | Superseded standalone POC with copied model/renderer code; the integrated Canvas implementation and provenance remain in `src/web` |
| `tools/delete_jules_sessions.py` and its test | Remove, including from writable branch/tag history | Unrelated account-wide administration utility; exact-session code-review cleanup remains in `.github` |
| `tools/` | Keep and document | Build, MCP, export consumers, native/browser acceptance and benchmark tooling for Sugar Maple |
| `prototypes/library-preview/` | Keep | Active bounded JavaScript/Swift preview experiment, used by tooling and Editor CI; no shipping arbitrary-code importer |
| `designs/brand/` | Keep | Sugar Maple's own editable app icon source |

The removed paths and Apple private-key/certificate formats are ignored to
prevent accidental recommits. Separate design documents should be stored outside
the public checkout. Credentials and build/dependency caches remain local.

## Credential audit

Gitleaks 8.30.1 scanned all locally fetched Git history and an exported snapshot
of 1,826 existing tracked files before the documentation additions. The snapshot
excludes ignored dependencies and build output; archive scanning was enabled for
the snapshot. There were 74 historical flags and 34 current-tree flags. Every
flag was checked against its exact source line and was a 64-character SHA-256
file checksum in a QA verification record. No credential was identified. The
new Xcode Cloud manifest contains project/target identifiers, not authentication
material. This is a credential-pattern audit, not a claim that future files or
arbitrary imported code are safe.

## History delivery and existing clones

The retired handoff and copied prototype exceeded the review action's diff-size
budget. Remove only the four paths above in a separate clone first, verify that
every other file on every branch is unchanged, and publish with explicit leases
against the captured remote heads. Then review and validate the compact app and
setup changes against the cleaned main branch before merging them. Keep recovery
bundles and removed files in a private local directory outside the public
checkout. Verify the final main tree matches the reviewed tree and check a fresh
remote clone for the removed paths. The review size limit remains unchanged.

History rewriting changes commit IDs after the removed content was introduced.
Use a fresh clone for new work. If an existing checkout has local edits, preserve
them and replay only the intended clean changes onto the rewritten branch;
merging or pushing an old branch can restore the removed history. Historical QA
commit hashes describe the original runs and are not restated as new tests.

GitHub-managed pull-request refs, cached commit views, forks and other people's
clones are outside a normal branch/tag rewrite. Repository owners cannot push
to `refs/pull/*`. GitHub documents separate support handling for sensitive-data
removal and does not promise removal of non-sensitive cached content. See
[GitHub's history-removal documentation](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).
