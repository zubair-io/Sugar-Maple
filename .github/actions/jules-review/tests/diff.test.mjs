import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectReviewDiff } from '../lib/diff.js';

const file = (path, body) => `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -0,0 +1 @@\n+${body}\n`;

test('a large archive cannot displace shipping source later in the diff', () => {
  const source = file('src/web/editor.ts', 'important implementation');
  const archive = file('designs/example/document.json', 'x'.repeat(2000));
  const result = selectReviewDiff(archive + source, source.length + 10);
  assert.equal(result.text, source);
  assert.match(result.truncatedNote, /designs\/example\/document.json/);
});

test('preserves complete source hunks and refuses incomplete shipping review', () => {
  const source = file('tools/check.ts', 'x'.repeat(300));
  assert.throws(() => selectReviewDiff(source, 100), /Shipping source diff exceeds/);
  assert.deepEqual(selectReviewDiff(source, source.length), { text: source });
});

test('recognizes quoted paths and retains workflow changes before optional fixtures', () => {
  const quoted = 'diff --git "a/src/apple/Sugar Maple/Editor.swift" "b/src/apple/Sugar Maple/Editor.swift"\n+changed\n';
  const workflow = file('.github/workflows/editor.yml', 'typecheck');
  const fixture = file('prototypes/example.ts', 'x'.repeat(1000));
  assert.equal(selectReviewDiff(fixture + quoted + workflow, quoted.length + workflow.length).text, quoted + workflow);
});
