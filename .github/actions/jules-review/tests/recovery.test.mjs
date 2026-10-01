import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activitySummary, publishedSessionReference, validateRecoveryInput, validateSessionSource } from '../lib/recovery-policy.js';
const bot = { login: 'github-actions[bot]', type: 'Bot' };
const final = { user: bot, body: '<!-- jules-pr-reviewer -->\n## Jules Review\nVERDICT: approve\n\n---\n_Session: `123`_' };
test('cleanup requires a trusted published verdict/footer for the exact session', () => {
  assert.equal(publishedSessionReference([final], '123', true), true);
  for (const altered of [
    { ...final, user: { login: 'attacker', type: 'Bot' } },
    { ...final, user: { login: 'github-actions[bot]', type: 'User' } },
    { ...final, body: final.body + '\nspoofed suffix' },
    { ...final, body: final.body.replace('VERDICT: approve', 'Review in progress') },
  ]) assert.equal(publishedSessionReference([altered], '123', true), false);
  assert.equal(publishedSessionReference([final], '12', true), false);
});
test('timed-out sessions can be inspected but cannot be deleted', () => {
  const failed = { user: bot, body: '<!-- jules-pr-reviewer -->\nJules PR review failed to complete.\nSession: `123`' };
  assert.equal(publishedSessionReference([failed], '123', false), true);
  assert.equal(publishedSessionReference([failed], '123', true), false);
  assert.equal(publishedSessionReference([failed], '1234', false), false);
});
test('recovery rejects path injection, wrong repository/identity, invalid mode and PR number', () => {
  assert.deepEqual(validateRecoveryInput('123', '54', 'cleanup'), {sessionId:'123',prNumber:54,mode:'cleanup'});
  for (const args of [['../123','54','cleanup'],['123','0','inspect'],['123','54','delete-all'],['123','54;run','inspect']])
    assert.throws(() => validateRecoveryInput(...args));
  validateSessionSource({ name:'sessions/123',sourceContext:{source:'sources/github/owner/repo'} }, '123','owner/repo');
  for (const session of [
    {name:'sessions/124',sourceContext:{source:'sources/github/owner/repo'}},
    {name:'sessions/123',sourceContext:{source:'sources/github/other/repo'}},
    {name:'sessions/123'},
  ]) assert.throws(() => validateSessionSource(session,'123','owner/repo'));
});
test('activity diagnostics expose counts without private messages or failure bodies', () => {
  const result = activitySummary([{agentMessaged:{agentMessage:'private secret'}},{sessionFailed:{reason:'private secret'}},{sessionCompleted:{}},{progressUpdated:{description:'private secret'}}]);
  assert.deepEqual(result,{activities:4,agentMessages:1,failures:1,completions:1});
  assert.doesNotMatch(JSON.stringify(result),/private|secret/);
});
