# Jules code reviews

The Jules PR Review workflow reviews non-draft, same-repository pull requests, including stacked PRs targeting another feature branch. Fork and Dependabot PRs do not receive API credentials. Review findings are posted as a PR comment and the `jules/review` commit status records the verdict. Blocking findings fail that status; this does not configure branch protection automatically.

## Setup

1. Connect `zubair-io/Sugar-Maple` in the [Jules GitHub integration](https://jules.google/docs/api/reference/).
2. Create an API key in [Jules settings](https://jules.google.com/settings).
3. Run the following command and paste the key into its hidden interactive prompt:

   ```sh
   gh secret set JULES_API_KEY --repo zubair-io/Sugar-Maple
   ```

4. Open or update a ready PR, or rerun a failed Jules workflow after adding the secret.

GitHub supplies `GITHUB_TOKEN` automatically. Do not put the Jules key in source, a PR comment, or a command-line argument. The workflow fails with setup instructions when the secret is missing.

## Session cleanup

The review action waits for a completed session containing an explicit verdict. After the review comment and commit status have both been saved to GitHub, it deletes that exact session using the [Jules REST API](https://jules.google/docs/api/reference/sessions). This applies to approve, comment, and block verdicts. The review remains readable on GitHub; its recorded Jules session ID is an audit reference, not a working session link after deletion.

No account-wide session listing or bulk deletion is performed. Failed, timed-out, or unpublished reviews retain their session for investigation. Cleanup failures fail the workflow without replacing the published findings or verdict. A missing session (HTTP 404) counts as already deleted. Active workflow runs are not automatically cancelled when another commit arrives, allowing cleanup to finish. Manual cancellation or runner loss can still leave a session behind.

The [official Jules CLI reference](https://jules.google/docs/cli/reference/) documents listing, creating, and pulling sessions, but does not document a delete subcommand. For manual cleanup, with `JULES_API_KEY` already available in your shell environment, replace `SESSION_ID` with the exact reviewed session ID:

```sh
curl --fail-with-body --request DELETE \
  --header "x-goog-api-key: $JULES_API_KEY" \
  'https://jules.googleapis.com/v1alpha/sessions/SESSION_ID'
```

## Maintenance and verification

The reviewer is a locally maintained adaptation of the MIT-licensed action used in `_Maple`. See [.github/actions/jules-review/README.md](../../.github/actions/jules-review/README.md) for provenance and changes. Its source is compiled in CI; generated bundles and dependencies are not committed.

```sh
cd .github/actions/jules-review
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build
```

Tests cover completion gating, publish-before-delete ordering, exact-session targeting, publication failures, deletion failures, idempotent cleanup and malformed IDs. They use simulated API responses and do not prove live credentials or repository access. An actual review requires the setup above.
