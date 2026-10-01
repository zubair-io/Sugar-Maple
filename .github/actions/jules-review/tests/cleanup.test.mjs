import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deleteSession, isFinalReview, publishThenDelete } from '../lib/cleanup.js';

test('progress and unfinished sessions never qualify as finished reviews', () => {
  assert.equal(isFinalReview('inProgress', 'VERDICT: approve'), false);
  assert.equal(isFinalReview('completed', 'Still reviewing'), false);
  assert.equal(isFinalReview('failed', 'VERDICT: block'), false);
  for (const verdict of ['approve', 'comment', 'block']) {
    assert.equal(isFinalReview('completed', `Findings\nVERDICT: ${verdict}`), true);
    assert.equal(isFinalReview('COMPLETED', `Findings\nVERDICT: ${verdict}`), true);
  }
});

test('transient cleanup retries are bounded and do not expose upstream bodies', async () => {
  let requests = 0; const delays = [];
  const attempts = await deleteSession('123', 'secret', async () => {
    requests++; return new Response('upstream secret', { status: requests < 3 ? 503 : 200 });
  }, async ms => delays.push(ms));
  assert.equal(attempts, 3); assert.equal(requests, 3); assert.deepEqual(delays, [1000, 2000]);
  requests = 0;
  await assert.rejects(deleteSession('123', 'secret', async () => {
    requests++; return new Response('upstream secret', { status: 429 });
  }, async () => {}), /HTTP 429; 3 cleanup attempt/);
  assert.equal(requests, 3);
});

test('auth and permission failures do not retry; network timeout does', async () => {
  for (const status of [400, 401, 403]) {
    let requests = 0;
    await assert.rejects(deleteSession('123', 'secret', async () => {
      requests++; return new Response('upstream secret', { status });
    }, async () => assert.fail('Must not wait/retry')), new RegExp(`HTTP ${status}; 1 cleanup attempt`));
    assert.equal(requests, 1);
  }
  let requests = 0;
  assert.equal(await deleteSession('123', 'secret', async () => {
    if (++requests === 1) throw new DOMException('secret', 'TimeoutError');
    return new Response(null, { status: 404 });
  }, async () => {}), 2);
});

test('publishes first, then deletes only the exact session with authentication', async () => {
  const calls = [];
  await publishThenDelete('123', 'test-key', async () => calls.push('published'), async (url, options) => {
    assert.deepEqual(calls, ['published']);
    assert.equal(url, 'https://jules.googleapis.com/v1alpha/sessions/123');
    assert.equal(options.method, 'DELETE');
    assert.equal(options.headers['x-goog-api-key'], 'test-key');
    assert.equal(options.redirect, 'error');
    calls.push('deleted');
    return new Response(null, { status: 200 });
  }, assert.fail);
  assert.deepEqual(calls, ['published', 'deleted']);
});

test('publication failure retains the session', async () => {
  await assert.rejects(publishThenDelete('123', 'key', async () => { throw new Error('GitHub failed'); },
    async () => { assert.fail('Must not delete'); }, assert.fail), /GitHub failed/);
});

test('404 is an idempotent cleanup success', async () => {
  await publishThenDelete('123', 'key', async () => {}, async () => new Response(null, { status: 404 }), assert.fail);
});

test('cleanup failure reports the problem without rewriting the saved review', async () => {
  let published = 0;
  const errors = [];
  await publishThenDelete('123', 'secret', async () => published++,
    async () => new Response('secret upstream body', { status: 403 }), message => errors.push(message));
  assert.equal(published, 1);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Review saved/);
  assert.doesNotMatch(errors[0], /secret/);
});

test('invalid session IDs cannot change the API path', async () => {
  const errors = [];
  await publishThenDelete('../other', 'key', async () => {},
    async () => assert.fail('Must not request'), message => errors.push(message));
  assert.equal(errors.length, 1);
});
