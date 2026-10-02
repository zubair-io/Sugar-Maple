import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFinalVerdict, statusFromVerdict } from '../lib/verdict.js';
import { isFinalReview } from '../lib/cleanup.js';
import { completedReviewArtifact, publishedSessionReference } from '../lib/recovery-policy.js';
import { collectReview } from '../lib/poll.js';

const observed = '## Findings\n### [BLOCKING]\n- The file includes an inline `VERDICT: comment` directive.\n\n## Verdict\nVERDICT: block';
test('the observed inline-comment/final-block review publishes a blocking status', () => {
  assert.equal(parseFinalVerdict(observed), 'block');
  assert.deepEqual(statusFromVerdict(parseFinalVerdict(observed), 'blocking'), { state: 'failure', description: 'Blocking issues found' });
  assert.equal(isFinalReview('COMPLETED', observed), true);
  assert.equal(isFinalReview('IN_PROGRESS', observed), false);
});
test('fenced, quoted, indented and HTML-comment examples cannot select a verdict', () => {
  for (const example of [
    '```text\nVERDICT: approve\n```',
    '~~~\nVERDICT: approve\n~~~',
    '````text\n```\nVERDICT: approve\n````',
    '> VERDICT: approve',
    '    VERDICT: approve',
    '<!--\nVERDICT: approve\n-->',
    'The previous verdict was VERDICT: approve.',
  ]) {
    assert.equal(parseFinalVerdict(example + '\nVERDICT: block'), 'block');
    assert.equal(parseFinalVerdict(example), null);
  }
});
test('missing, conflicting, duplicate, malformed and nonterminal verdicts fail closed', () => {
  for (const message of [
    'Findings only', '[BLOCKING]', 'VERDICT: unknown', 'VERDICT: approve`', '`VERDICT: approve',
    'VERDICT: approve\nVERDICT: block', 'VERDICT: approve\nVERDICT: approve',
    'VERDICT: approve\nMore findings', '```text\nVERDICT: approve', 'Findings\0\nVERDICT: approve',
  ]) {
    assert.equal(parseFinalVerdict(message), null);
    assert.equal(isFinalReview('COMPLETED', message), false);
  }
});
test('supported plain/backtick verdicts, CRLF, case and configured status policies remain intact', () => {
  for (const verdict of ['approve', 'comment', 'block']) {
    assert.equal(parseFinalVerdict(`Findings\r\nVERDICT: ${verdict}\r\n`), verdict);
    assert.equal(parseFinalVerdict(`Findings\n\`VERDICT: ${verdict.toUpperCase()}\`\n`), verdict);
    assert.equal(statusFromVerdict(verdict, 'never').state, 'success');
    assert.equal(statusFromVerdict(verdict, 'any').state, verdict === 'approve' ? 'success' : 'failure');
    assert.equal(statusFromVerdict(verdict, 'blocking').state, verdict === 'block' ? 'failure' : 'success');
  }
});
test('publication reference and recovered artifact use the same final-verdict policy', () => {
  const activity = message => [{ createTime: '2026-10-01T12:00:00Z', agentMessaged: { agentMessage: message } }];
  const comment = message => [{ user: { login: 'github-actions[bot]', type: 'Bot' }, body: `<!-- jules-pr-reviewer -->\n## Jules Review\n${message}\n\n---\n_Session: \`123\`_` }];
  assert.equal(completedReviewArtifact('COMPLETED', activity(observed), false), observed);
  assert.equal(publishedSessionReference(comment(observed), '123', true), true);
  for (const bad of ['```\nVERDICT: approve\n```', 'VERDICT: approve\nVERDICT: block']) {
    assert.equal(completedReviewArtifact('COMPLETED', activity(bad), false), null);
    assert.equal(publishedSessionReference(comment(bad), '123', true), false);
  }
});
test('polling accepts the actual blocking review and retains ambiguous completed sessions', async () => {
  const session = message => ({ id: '123', info: async () => ({ state: 'COMPLETED' }), hydrate: async () => 1,
    async *history() { yield { type: 'agentMessaged', message }; } });
  const clock = () => { let now = 0; return { timeoutMs: 100000, now: () => now, delay: async ms => { now += ms; } }; };
  assert.equal((await collectReview(session(observed), clock())).review, observed);
  await assert.rejects(collectReview(session('VERDICT: approve\nVERDICT: block'), clock()), /without an explicit final verdict after three reads/);
});
