# Sugar Maple Jules reviewer

Adapted from [sanjay3290/jules-pr-reviewer](https://github.com/sanjay3290/jules-pr-reviewer/tree/432e901b3bc32353e7c75503421c64df4ffccc8b), commit `432e901b3bc32353e7c75503421c64df4ffccc8b`, the same action revision used by `_Maple/.github/workflows/jules-pr-review.yml` when inspected. The upstream MIT license is retained in `LICENSE`.

Local changes:

- Require completed session state and an explicit verdict before accepting a review.
- Delete only the current review session, after publishing its comment and commit status. Keep failed/unpublished sessions; report cleanup failures without overwriting review findings.
- Add cleanup tests and use Node 24.
- Update the locked transitive `undici` dependency to resolve the advisories reported by `npm audit`.

`action.yml`, `src/index.ts`, `src/prompt.ts`, and the build configuration originate upstream. `src/cleanup.ts` and its tests are local additions. Dependencies install from the lockfile and the workflow builds the action before executing it. `dist/`, `lib/`, and `node_modules/` are excluded from Git.

See [setup and cleanup instructions](../../../docs/development/jules.md). Live review validation requires repository access in Jules and the `JULES_API_KEY` GitHub secret.
