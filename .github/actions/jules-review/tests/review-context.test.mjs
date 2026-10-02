import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pinnedCurrentPull, pinnedPreparedPull, completeMergeBase, pinnedBranchBase } from '../lib/review-context.js';
const head = 'a'.repeat(40), base = 'b'.repeat(40);

test('current edited description is used while the code head remains pinned', () => {
  const current = { head: { sha: head }, base: { sha: base }, body: 'Current description after retargeting', title: 'Current title' };
  assert.equal(pinnedCurrentPull(head, current), current);
  assert.throws(() => pinnedCurrentPull('c'.repeat(40), current), /head changed/);
});

test('base or head movement during preparation cannot start a review on stale context', () => {
  assert.throws(() => pinnedPreparedPull(head, base, { head: { sha: head }, base: { sha: 'c'.repeat(40) } }), /base changed/);
  assert.throws(() => pinnedPreparedPull(head, base, { head: { sha: 'c'.repeat(40) }, base: { sha: base } }), /head changed/);
  assert.throws(() => pinnedCurrentPull(head, { head: { sha: head }, base: { sha: '--invalid' } }), /full commit SHA/);
});

test('merge-base metadata selects complete committed trees without trusting file patches', () => {
  assert.equal(completeMergeBase(base, head, 'c'.repeat(40)), 'c'.repeat(40));
  assert.throws(() => completeMergeBase(base, head, undefined), /complete merge-base/);
  assert.throws(() => completeMergeBase(base, head, 'main'), /full commit SHA/);
});


test('current branch ref replaces cached PR base SHA and movement rejects before review', () => {
  const cached = { head: { sha: head }, base: { sha: base, ref: 'main' }, body: 'Current description' };
  const current = pinnedBranchBase(cached, 'd'.repeat(40));
  assert.equal(current.base.sha, 'd'.repeat(40));
  assert.equal(current.base.ref, 'main');
  assert.equal(current.body, cached.body);
  assert.equal(cached.base.sha, base);
  assert.throws(() => pinnedPreparedPull(head, base, current), /base changed/);
  assert.throws(() => pinnedBranchBase(cached, 'main'), /full commit SHA/);
});
