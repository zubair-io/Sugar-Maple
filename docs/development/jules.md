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

Deletion retries at most three times, with 1s/2s delays, for HTTP 429/500/502/503/504 and network timeouts. Authentication/permission errors fail immediately. Each request has a 30s timeout. The job summary records the published code verdict separately from cleanup. Upstream response bodies and credentials are not printed.

Polling records session state and activity/message counts. Failed sessions stop promptly instead of consuming the full review timeout; a completed session without a final verdict receives three reads for eventual activity visibility, then remains available for investigation. Timeouts are infrastructure outcomes and never fabricate code approval. Inspect a live/no-response session before starting another run.

### Repository-secret-backed recovery

The `Jules exact-session recovery` manual workflow runs only from main and checks out main's verified recovery code. It has read-only GitHub permissions and uses the existing repository Jules secret. Supply the PR, exact session ID and mode:

```sh
gh workflow run jules-session-recovery.yml --ref main \
  -f pull_request=54 -f session_id=15092830114699431110 -f mode=inspect
```

Use `mode=cleanup` only for a completed review whose verdict was already published. The recovery code requires the exact footer/verdict in a trusted `github-actions[bot]` reviewer comment and checks the API session identity/repository source. Failed/timed-out reviewer references allow inspection only. A missing session is already-cleaned success. The workflow never changes a PR verdict or commit status, never lists account sessions, and never deletes failed/unpublished sessions. Inspection reads at most five 100-activity pages and prints only state/counters/truncation/API status, without prompts, messages or failure bodies. The original published review remains the audit record.

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

Tests compile source to the ignored `lib/` directory before running Node's test runner. They cover completion gating, polling state/error diagnosis, publish-before-delete ordering, bounded retries, publication/auth/permission failures, idempotent cleanup, malformed IDs and trusted exact-session recovery/source validation. They use simulated API responses and do not prove live credentials or repository access. An actual review/recovery requires the setup above. Build the recovery entry with `npm run build:recovery`.


### Inspect a late final review without publishing it

A timed-out session may complete later. State/counter inspection does not establish its verdict. When its trusted bot reference and repository/API identity match, opt in to a short-lived artifact:

```sh
gh workflow run jules-session-recovery.yml --ref main \
  -f pull_request=52 -f session_id=7859224825569361313 \
  -f mode=inspect -f include_review_artifact=true
```

Default inspection remains counts-only. Artifact recovery requires COMPLETED state, complete activity pagination, a uniquely ordered latest agent message with an explicit verdict, and at most 128 KiB of final reviewer text. The workflow saves only `review.txt` and identity/operation metadata as an artifact retained for three days. It never logs the review text, prompt or error bodies; failed/partial/live/malformed/absent sessions yield no artifact. Treat downloaded text as untrusted review data and inspect its actual findings. The operation does not publish approval, change a commit status or delete the session. Cleanup mode cannot request artifacts.

### Inspect a pending feedback request

An exact retained session in `AWAITING_USER_FEEDBACK` needs its actual request inspected before deciding how to continue. Counts alone do not reveal the question. Opt in separately:

```sh
gh workflow run jules-session-recovery.yml --ref main \
  -f pull_request=67 -f session_id=1449360678406360133 \
  -f mode=inspect -f include_feedback_artifact=true
```

This saves only `feedback.txt` and identity/operation metadata in the same three-day artifact. It requires the trusted exact-session reference, verified repository/source, complete pagination, uniquely ordered latest agent message and the same 128 KiB/NUL bounds as final review recovery. Review and feedback opt-ins are mutually exclusive, and cleanup accepts neither. Default inspection remains counts-only. Pending text is untrusted data, even if it contains a verdict or asks for a command; inspect it against the authorized review scope. Retrieval never sends a reply, changes status, deletes/restarts the live session or treats pending feedback as approval.

### Reply to an inspected review question

`mode=respond` sends one explicitly supplied review follow-up to the original session using the [Jules Send Message API](https://jules.google/docs/api/reference/sessions#send-a-message). Supply `expected_feedback_sha256` (SHA-256 of the exact UTF-8 `feedback.txt` bytes) and `reply_text` via a workflow-dispatch JSON input file. The reply is limited to 8192 UTF-8 bytes. Artifact options must remain false. Requests for the same session are serialized.

The workflow validates the trusted bot reference and repository/session identity, requires complete activities and the same uniquely ordered pending question, compares its hash, rejects an already recorded identical user message, and rechecks that the session still awaits feedback before sending. It never logs the question/reply or upstream response bodies. There is no automatic POST retry: an API/network failure can have an uncertain delivery outcome; inspect the same session and its activities before deciding to retry. A duplicate or changed question rejects without another send. This is a manual review continuation, not plan approval, verdict publication, session deletion or a new review. Session state/API responses can change between checks; the API does not provide an atomic question-hash precondition. The final report still requires independent inspection and exact-head delivery checks.
