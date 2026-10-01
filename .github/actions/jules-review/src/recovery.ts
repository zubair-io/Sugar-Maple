import * as core from '@actions/core';
import * as github from '@actions/github';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { deleteSession, SessionCleanupError } from './cleanup.js';
import { activitySummary, completedReviewArtifact, publishedSessionReference, RecoveryPolicyError, validateRecoveryInput, validateSessionSource } from './recovery-policy.js';
class RecoveryOperationError extends Error {}
async function run() {
  if (github.context.eventName !== 'workflow_dispatch' || process.env.GITHUB_REF !== 'refs/heads/main')
    throw new RecoveryOperationError('Recovery runs only from the main-branch manual workflow.');
  const apiKey = process.env.JULES_API_KEY, token = process.env.GH_TOKEN;
  if (!apiKey || !token) throw new RecoveryOperationError('Repository Jules/GitHub credentials are required.');
  core.setSecret(apiKey); core.setSecret(token);
  const input = validateRecoveryInput(process.env.SESSION_ID ?? '', process.env.PR_NUMBER ?? '', process.env.RECOVERY_MODE ?? '');
  const includeReview = process.env.INCLUDE_REVIEW_ARTIFACT === 'true';
  if (includeReview && input.mode !== 'inspect') throw new RecoveryOperationError('Review artifacts require inspection-only mode.');
  const { owner, repo } = github.context.repo;
  const comments = await github.getOctokit(token).paginate('GET /repos/{owner}/{repo}/issues/{issue_number}/comments', { owner, repo, issue_number: input.prNumber, per_page: 100 });
  if (!publishedSessionReference(comments, input.sessionId, input.mode === 'cleanup'))
    throw new RecoveryOperationError('This PR has no trusted reviewer reference for the exact session and requested operation.');
  const response = await fetch(`https://jules.googleapis.com/v1alpha/sessions/${input.sessionId}`, {
    headers: { 'x-goog-api-key': apiKey }, redirect: 'error', signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 404) {
    if (includeReview) throw new RecoveryOperationError('Session is already absent; no review artifact can be recovered.');
    core.info(`Session ${input.sessionId} already absent. No deletion performed.`);
    await core.summary.addRaw(`PR #${input.prNumber}, session ${input.sessionId}: already absent (HTTP404).`).write(); return;
  }
  if (!response.ok) throw new RecoveryOperationError(`Session inspection returned HTTP ${response.status}. No deletion performed.`);
  const session = await response.json();
  validateSessionSource(session, input.sessionId, `${owner}/${repo}`);
  const state = ['QUEUED', 'PLANNING', 'AWAITING_PLAN_APPROVAL', 'AWAITING_USER_FEEDBACK', 'IN_PROGRESS', 'PAUSED', 'FAILED', 'COMPLETED'].includes(session.state) ? session.state : 'UNKNOWN';
  let outcome = 'inspect only; session retained';
  let diagnosis = '';
  if (input.mode === 'cleanup') {
    if (state !== 'COMPLETED') throw new RecoveryOperationError(`Session is ${state}; only completed, already-published reviews can be deleted.`);
    const attempts = await deleteSession(input.sessionId, apiKey, fetch);
    outcome = `published completed session deleted/already absent after ${attempts} attempt(s)`;
  } else {
    const activities: Record<string, unknown>[] = [];
    let pageToken = '', pages = 0;
    do {
      const url = new URL(`https://jules.googleapis.com/v1alpha/sessions/${input.sessionId}/activities`);
      url.searchParams.set('pageSize', '100');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const activityResponse = await fetch(url, { headers: { 'x-goog-api-key': apiKey }, redirect: 'error', signal: AbortSignal.timeout(30_000) });
      if (!activityResponse.ok) { diagnosis = `Activity inspection returned HTTP${activityResponse.status}; no bodies logged.`; break; }
      const data = await activityResponse.json();
      if (!Array.isArray(data.activities ?? [])) throw new RecoveryOperationError('Activity API returned an invalid collection. Session retained.');
      if ((data.activities ?? []).some((a: unknown) => a === null || typeof a !== 'object' || Array.isArray(a)))
        throw new RecoveryOperationError('Activity API returned an invalid item. Session retained.');
      activities.push(...(data.activities ?? [])); pages++;
      pageToken = typeof data.nextPageToken === 'string' ? data.nextPageToken : '';
    } while (pageToken && pages < 5);
    diagnosis += ` Activity counters: ${JSON.stringify(activitySummary(activities))}; truncated=${!!pageToken}. Prompts/messages/error bodies are not printed.`;
    if (includeReview) {
      const review = completedReviewArtifact(state, activities, !!pageToken || !!diagnosis.match(/Activity inspection returned/));
      if (!review) throw new RecoveryOperationError('No complete, ordered final review artifact is available. Session retained; no verdict inferred.');
      const root = process.env.RUNNER_TEMP;
      if (!root) throw new RecoveryOperationError('The trusted runner temporary directory is unavailable.');
      const directory = join(root, 'jules-review-recovery');
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeFile(join(directory, 'review.txt'), review, { mode: 0o600 });
      await writeFile(join(directory, 'context.json'), JSON.stringify({
        repository: `${owner}/${repo}`, pullRequest: input.prNumber, sessionId: input.sessionId, state,
        trustedCommentAndSourceVerified: true, publishesVerdict: false, bytes: Buffer.byteLength(review, 'utf8'),
        notice: 'Untrusted recovered review data. Inspect actual findings; no approval or commit status is inferred or published.',
      }, null, 2), { mode: 0o600 });
      diagnosis += ' Final reviewer text saved only to the opt-in short-lived artifact; session retained and no code status changed.';
    }
  }
  core.info(`PR #${input.prNumber}, session ${input.sessionId}: state=${state}; ${outcome}. ${diagnosis}`);
  await core.summary.addHeading('Exact-session recovery').addRaw(`PR #${input.prNumber}; session ${input.sessionId}; state ${state}.\n\n${outcome}. ${diagnosis}\n\nPublished code verdict and commit status were not changed.`).write();
}
run().catch(error => {
  // Fetch/SDK error bodies can contain prompts or credentials. Retain them out
  // of workflow output; actionable operation/state checks above are safe.
  const detail = error instanceof RecoveryPolicyError || error instanceof SessionCleanupError || error instanceof RecoveryOperationError
    ? error.message : 'Network/API inspection failed; verify repository credentials and retry the same session.';
  core.setFailed(`Exact-session recovery failed: ${detail} No code verdict was rewritten.`);
});
