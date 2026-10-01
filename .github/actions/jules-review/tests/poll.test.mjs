import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectReview } from '../lib/poll.js';
function clock(timeoutMs = 100000) {
  let now = 0; const reports = [];
  return { timeoutMs, now: () => now, delay: async ms => { now += ms; }, report: message => reports.push(message), reports };
}
function fixture(state, activities = []) {
  return { id: '123', info: async () => ({ state }), hydrate: async () => 0, async *history() { yield* activities; } };
}
test('completed final verdict is accepted; live sessions never fabricate approval', async () => {
  const done = await collectReview(fixture('completed', [{ type: 'agentMessaged', message: 'Findings\nVERDICT: approve' }]), clock());
  assert.equal(done.review, 'Findings\nVERDICT: approve'); assert.equal(done.timedOut, false); assert.equal(done.messages, 1);
  const options = clock(40000), live = await collectReview(fixture('inProgress', [{ type: 'agentMessaged', message: 'VERDICT: approve' }]), options);
  assert.equal(live.timedOut, true); assert.equal(live.review, ''); assert.equal(live.state, 'inProgress');
  assert.match(options.reports[0], /state=inProgress; activities=1; agentMessages=1/);
});
test('failed sessions stop immediately; completed sessions without verdict retain diagnosis', async () => {
  const failed = fixture('failed'); failed.hydrate = async () => assert.fail('Do not wait for a failed session');
  await assert.rejects(collectReview(failed, clock()), /failed without a published review/);
  const options = clock();
  await assert.rejects(collectReview(fixture('COMPLETED', [{ type: 'agentMessaged', message: 'Still working' }]), options), /without an explicit final verdict after three reads/);
  assert.equal(options.reports.length, 3);
});
test('eventual activity visibility retries; auth fails promptly without exposing the upstream body', async () => {
  const session = fixture('completed', [{ type: 'agentMessaged', message: 'VERDICT: comment' }]);
  let attempts = 0;
  session.hydrate = async () => { if (++attempts === 1) throw Error('404 secret upstream body'); return 1; };
  const result = await collectReview(session, clock()); assert.equal(result.attempts, 2); assert.equal(result.review, 'VERDICT: comment');
  session.info = async () => { throw Error('HTTP 403 private prompt secret'); };
  await assert.rejects(collectReview(session, clock()), error => {
    assert.match(error.message, /HTTP 403/); assert.doesNotMatch(error.message, /private|secret/); return true;
  });
});
test('unknown states and a spoofed terminal error never leak arbitrary API content', async () => {
  const options = clock(20000), session = fixture('private secret state');
  session.hydrate = async () => { throw Error('Session 123 private secret'); };
  const result = await collectReview(session, options);
  assert.equal(result.timedOut, true); assert.equal(result.state, 'unknown');
  assert.doesNotMatch(options.reports.join('\n'), /private|secret/);
});
