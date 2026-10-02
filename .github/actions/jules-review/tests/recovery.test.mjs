import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { activitySummary, completedReviewArtifact, pendingFeedbackArtifact, recoveryArtifactKind, publishedSessionReference, validatePendingReply, validateRecoveryInput, validateSessionSource } from '../lib/recovery-policy.js';
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
test('opt-in artifacts require a complete final review and select chronologically, never by API page order', () => {
  const prior = {createTime:'2026-10-01T12:00:00.1Z',agentMessaged:{agentMessage:'Working'}}, last = {createTime:'2026-10-01T12:00:00.200000001Z',agentMessaged:{agentMessage:'A code issue\nVERDICT: block'}};
  assert.equal(completedReviewArtifact('COMPLETED',[last,prior],false),'A code issue\nVERDICT: block');
  assert.equal(completedReviewArtifact('COMPLETED',[prior,last],false),'A code issue\nVERDICT: block');
  for (const [state,list,truncated] of [
    ['FAILED',[last],false],['IN_PROGRESS',[last],false],['COMPLETED',[last],true],['COMPLETED',[prior],false],
    ['COMPLETED',[last,{...last}],false],['COMPLETED',[{...last,createTime:'bad'}],false],
    ['COMPLETED',[{...last,agentMessaged:{agentMessage:'VERDICT: approve\0'}}],false],
    ['COMPLETED',[{...last,agentMessaged:{agentMessage:'x'.repeat(131073)+'\nVERDICT: approve'}}],false],
    ['COMPLETED',[{...last,agentMessaged:'malformed'}],false],
  ]) assert.equal(completedReviewArtifact(state,list,truncated),null);
});
test('artifact opt-ins are inspection-only, exclusive and off by default', () => {
  assert.equal(recoveryArtifactKind('inspect', false, false), null);
  assert.equal(recoveryArtifactKind('cleanup', false, false), null);
  assert.equal(recoveryArtifactKind('inspect', true, false), 'review');
  assert.equal(recoveryArtifactKind('inspect', false, true), 'feedback');
  for (const args of [['cleanup',true,false],['cleanup',false,true],['inspect',true,true]])
    assert.throws(() => recoveryArtifactKind(...args));
});
test('pending feedback can be inspected without completion or an inferred verdict', () => {
  const prior = {createTime:'2026-10-01T12:00:00Z',agentMessaged:{agentMessage:'Working'}},
    last = {createTime:'2026-10-01T12:00:01Z',agentMessaged:{agentMessage:'Which consumer should I inspect?'}};
  assert.equal(pendingFeedbackArtifact('AWAITING_USER_FEEDBACK',[last,prior],false),last.agentMessaged.agentMessage);
  assert.equal(completedReviewArtifact('AWAITING_USER_FEEDBACK',[last],false),null);
  for (const [state,list,truncated] of [
    ['IN_PROGRESS',[last],false],['COMPLETED',[last],false],['FAILED',[last],false],
    ['AWAITING_USER_FEEDBACK',[last],true],['AWAITING_USER_FEEDBACK',[],false],
    ['AWAITING_USER_FEEDBACK',[last,{...last}],false],
    ['AWAITING_USER_FEEDBACK',[{...last,createTime:'bad'}],false],
    ['AWAITING_USER_FEEDBACK',[{...last,agentMessaged:{agentMessage:'\0'}}],false],
    ['AWAITING_USER_FEEDBACK',[{...last,agentMessaged:{agentMessage:'x'.repeat(131073)}}],false],
    ['AWAITING_USER_FEEDBACK',[{...last,agentMessaged:{agentMessage:'   '}}],false],
    ['AWAITING_USER_FEEDBACK',[{...last,agentMessaged:'invalid'}],false],
  ]) assert.equal(pendingFeedbackArtifact(state,list,truncated),null);
});
test('manual reply binds to a complete unchanged pending question and rejects duplicate delivery', () => {
  const question = 'Should I finish the report?', reply = 'Please finish the review report.';
  const hash = createHash('sha256').update(question).digest('hex');
  const messages = [{createTime:'2026-10-01T12:00:00Z',agentMessaged:{agentMessage:question}}];
  assert.equal(validateRecoveryInput('123','67','respond').mode,'respond');
  assert.equal(validatePendingReply('AWAITING_USER_FEEDBACK',messages,false,hash,reply),createHash('sha256').update(reply).digest('hex'));
  for (const args of [
    ['COMPLETED',messages,false,hash,reply], ['IN_PROGRESS',messages,false,hash,reply],
    ['AWAITING_USER_FEEDBACK',messages,true,hash,reply], ['AWAITING_USER_FEEDBACK',[],false,hash,reply],
    ['AWAITING_USER_FEEDBACK',messages,false,'0'.repeat(64),reply],
    ['AWAITING_USER_FEEDBACK',messages,false,'bad',reply],
    ['AWAITING_USER_FEEDBACK',messages,false,hash,' '],
    ['AWAITING_USER_FEEDBACK',messages,false,hash,'\0'],
    ['AWAITING_USER_FEEDBACK',messages,false,hash,'é'.repeat(4097)],
    ['AWAITING_USER_FEEDBACK',[...messages,{userMessaged:{userMessage:reply}}],false,hash,reply],
  ]) assert.throws(() => validatePendingReply(...args));
  assert.throws(() => recoveryArtifactKind('respond',true,false));
  assert.throws(() => recoveryArtifactKind('respond',false,true));
});
