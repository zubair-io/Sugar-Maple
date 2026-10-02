import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { revisionArguments, readRevisionDiff, gitAuthentication, safeReviewFailure, RevisionDiffError } from '../lib/revision-diff.js';
import { selectReviewDiff } from '../lib/diff.js';

test('complete exact-tree diff handles over 20,000 archive lines and preserves prototype source', () => {
  const root = mkdtempSync(join(tmpdir(), 'review revision '));
  const git = (...args) => execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args], { cwd: root, encoding: 'utf8' }).trim();
  try {
    git('init', '-q');
    writeFileSync(join(root, 'baseline.txt'), 'baseline\n');
    git('add', '.'); git('commit', '-qm', 'base'); const base = git('rev-parse', 'HEAD');
    mkdirSync(join(root, 'docs/reviews'), { recursive: true });
    mkdirSync(join(root, 'prototypes/library-preview'), { recursive: true });
    writeFileSync(join(root, 'docs/reviews/archive.json'), Array.from({ length: 22_000 }, (_, i) => `evidence ${i}`).join('\n') + '\n');
    writeFileSync(join(root, 'prototypes/library-preview/scene.ts'), 'export const required = "complete prototype source";\n');
    git('add', '.'); git('commit', '-qm', 'candidate'); const head = git('rev-parse', 'HEAD');
    // An unrelated dirty file is not part of either committed tree.
    writeFileSync(join(root, 'prototypes/library-preview/scene.ts'), 'uncommitted replacement\n');
    const diff = readRevisionDiff(root, base, head);
    assert.ok(diff.split('\n').length > 20_000);
    assert.match(diff, /evidence 21999/);
    assert.match(diff, /complete prototype source/);
    assert.doesNotMatch(diff, /uncommitted replacement/);
    const selected = selectReviewDiff(diff, 1000);
    assert.match(selected.text, /complete prototype source/);
    assert.doesNotMatch(selected.text, /evidence 21999/);
    assert.match(selected.truncatedNote, /docs\/reviews\/archive.json/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('revision options cannot become Git options or executable shell text', () => {
  for (const invalid of ['main', '--output=/tmp/result', 'a'.repeat(40) + '; echo secret', 'a'.repeat(39)])
    assert.throws(() => revisionArguments(invalid, 'b'.repeat(40)), /full commit SHA/);
  assert.deepEqual(revisionArguments('a'.repeat(40), 'b'.repeat(40)).slice(-3), ['a'.repeat(40), 'b'.repeat(40), '--']);
});

test('authentication stays in child configuration, without changing parent environment', () => {
  const parent = { PATH: '/usr/bin', EXAMPLE: 'retained' };
  const environment = gitAuthentication('private-fixture-token', parent);
  assert.deepEqual(parent, { PATH: '/usr/bin', EXAMPLE: 'retained' });
  assert.equal(environment.GIT_TERMINAL_PROMPT, '0');
  assert.equal(environment.GIT_CONFIG_KEY_0, 'http.https://github.com/.extraheader');
  assert.equal(Buffer.from(environment.GIT_CONFIG_VALUE_0.split(' ').at(-1), 'base64').toString(), 'x-access-token:private-fixture-token');
  assert.equal(environment.EXAMPLE, 'retained');
});

test('blank and hostile upstream failures give an actionable operation without exposing bodies', () => {
  const empty = safeReviewFailure(new Error(''), 'exact revision diff');
  assert.match(empty, /exact revision diff failed/);
  assert.match(empty, /No session handle/);
  const hostile = safeReviewFailure({ status: 406, message: 'private-token prompt body' }, 'session observation', '1234');
  assert.match(hostile, /HTTP 406/);
  assert.match(hostile, /Session 1234 retained/);
  assert.doesNotMatch(hostile, /private-token|prompt body/);
  assert.equal(safeReviewFailure(new RevisionDiffError('Known validated revision error'), 'diff'), 'Known validated revision error');
});
