import { test } from 'node:test';
import assert from 'node:assert/strict';
import { submitReply } from '../lib/reply.js';
test('reply submits exactly one authenticated JSON request to the validated original session', async () => {
  let calls = 0;
  await submitReply('123','test-key','A quoted "reply"\nwith newline',async(url,options) => {
    calls++;
    assert.equal(url,'https://jules.googleapis.com/v1alpha/sessions/123:sendMessage');
    assert.equal(options.method,'POST');
    assert.equal(options.redirect,'error');
    assert.equal(options.headers['x-goog-api-key'],'test-key');
    assert.deepEqual(JSON.parse(options.body),{prompt:'A quoted "reply"\nwith newline'});
    return new Response(null,{status:204});
  });
  assert.equal(calls,1);
});
test('reply never retries an uncertain or rejected POST and never exposes response/error bodies', async () => {
  for (const status of [403,429,500,'network']) {
    let calls = 0;
    await assert.rejects(submitReply('123','test-key','reply',async() => {
      calls++;
      if (status === 'network') throw Error('private upstream body test-key');
      return new Response('private upstream body test-key',{status});
    }), error => !/private|test-key/.test(error.message) && /inspect/i.test(error.message));
    assert.equal(calls,1);
  }
});
test('reply rejects path injection and invalid payloads before network access', async () => {
  for (const [id,text] of [['../123','reply'],['123',' '],['123','x\0'],['123','é'.repeat(4097)]])
    await assert.rejects(submitReply(id,'test-key',text,async() => { assert.fail('Network called for invalid input'); }));
});
