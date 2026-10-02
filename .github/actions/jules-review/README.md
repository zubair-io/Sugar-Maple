# Sugar Maple Jules reviewer

Adapted from [sanjay3290/jules-pr-reviewer](https://github.com/sanjay3290/jules-pr-reviewer/tree/432e901b3bc32353e7c75503421c64df4ffccc8b), commit `432e901b3bc32353e7c75503421c64df4ffccc8b`, the same action revision used by `_Maple/.github/workflows/jules-pr-review.yml` when inspected. The upstream MIT license is retained in `LICENSE`.

Local changes:

- Require completed session state and an explicit verdict before accepting a review.
- Delete only the current review session, after publishing its comment and commit status. Keep failed/unpublished sessions; report cleanup failures without overwriting review findings.
- Add cleanup tests and use Node 24.
- Bound transient deletion retries, report session state/activity counts, fail promptly for terminal failures, and distinguish published verdict from cleanup in the workflow summary.
- Provide main-only, exact-session recovery guarded by a trusted published bot footer/verdict and matching repository source; failed/unpublished sessions can only be inspected.
- Update the locked transitive `undici` dependency to resolve the advisories reported by `npm audit`.

`action.yml`, `src/index.ts`, `src/prompt.ts`, and the build configuration originate upstream. `src/cleanup.ts` and its tests are local additions. Dependencies install from the lockfile and the workflow builds the action before executing it. `dist/`, `lib/`, and `node_modules/` are excluded from Git.

See [setup and cleanup instructions](../../../docs/development/jules.md). Live review validation requires repository access in Jules and the `JULES_API_KEY` GitHub secret.
# Complete revision diffs

The reviewer reads the exact event base/head commit trees through a temporary bare Git repository. This avoids GitHub's 20,000-line full-diff API limit without depending on truncated per-file patches. The temporary repository is removed after retrieval; the working checkout and its shallow boundaries are unchanged. Fetch credentials are supplied only in the child environment and masked in the action, never placed in command arguments or response logs.

All `src`, `tools`, `.github` and `prototypes` hunks must fit the existing 350,000-character payload budget. Executable prototype code cannot be displaced by design archives. Omitted non-runtime evidence paths are reported explicitly; shipping-source overflow fails the review instead of dropping code. Errors identify the operation and safe HTTP/exit category, keeping upstream bodies and credentials out of logs. Session observation and exact-session recovery policies are unchanged.
