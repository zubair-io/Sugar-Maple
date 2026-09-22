import { test, expect } from 'bun:test';
import { DocumentStore } from '../src/app/model/store';
const tx = (
  s: DocumentStore,
  operations: any[],
  origin: 'human' | 'agent' = 'human',
  requestId = crypto.randomUUID(),
) =>
  s.transact(
    { documentId: s.document.id, expectedRevision: s.revision, requestId, operations },
    origin,
  );
test('human feedback, atomic agent fix/reply/resolve, replay and undo preserve authorship', () => {
  const s = new DocumentStore(),
    pageId = s.document.pages[0].id;
  tx(s, [
    { type: 'node.add', node: { id: 'heading', pageId, kind: 'text', text: 'Old heading' } },
    { type: 'comment.add', id: 'feedback', pageId, text: '  Make the heading clearer.  ' },
  ]);
  expect(s.document.comments[0].messages[0]).toMatchObject({
    author: 'human',
    text: 'Make the heading clearer.',
  });
  const before = s.document;
  const request = {
    documentId: s.document.id,
    expectedRevision: s.revision,
    requestId: crypto.randomUUID(),
    operations: [
      { type: 'node.update', id: 'heading', patch: { text: 'Your notebooks' } },
      { type: 'comment.reply', id: 'feedback', text: 'Updated the heading to “Your notebooks”.' },
      { type: 'comment.resolve', id: 'feedback', resolved: true },
    ],
  };
  const receipt = s.transact(request, 'agent');
  expect(s.document.comments[0]).toMatchObject({ resolved: true, resolvedBy: 'agent' });
  expect(s.document.comments[0].messages[1].author).toBe('agent');
  expect(s.transact(request, 'agent')).toEqual(receipt);
  const restored = DocumentStore.fromCheckpoint(s.checkpoint());
  expect(restored.transact(request, 'agent')).toEqual(receipt);
  restored.undo();
  expect(restored.document).toEqual(before);
  restored.redo();
  expect(restored.document.comments[0].resolved).toBe(true);
  tx(restored, [{ type: 'comment.reply', id: 'feedback', text: 'Please also increase the size.' }]);
  expect(restored.document.comments[0]).toMatchObject({
    resolved: false,
    resolvedBy: null,
    resolvedAt: null,
  });
});
test('invalid comments reject atomically; deleting a page removes its feedback and undo restores it', () => {
  const s = new DocumentStore(),
    pageId = s.document.pages[0].id;
  const initial = s.document;
  expect(() =>
    tx(s, [
      { type: 'page.add', id: 'scratch', name: 'Scratch' },
      { type: 'comment.add', pageId: 'missing', text: 'bad' },
    ]),
  ).toThrow('Missing comment page');
  expect(s.document).toEqual(initial);
  expect(() => tx(s, [{ type: 'comment.add', pageId, text: '   ' }])).toThrow();
  expect(() => tx(s, [{ type: 'comment.add', pageId, text: 'x'.repeat(4001) }])).toThrow();
  expect(() => tx(s, [{ type: 'comment.add', pageId, text: 'spoof', author: 'agent' }])).toThrow();
  tx(s, [
    { type: 'comment.add', id: 'feedback', pageId, text: 'Review this page.' },
    { type: 'page.add', id: 'another', name: 'Another' },
  ]);
  expect(() => tx(s, [{ type: 'comment.add', id: 'feedback', pageId, text: 'duplicate' }])).toThrow(
    'Duplicate comment',
  );
  tx(s, [{ type: 'page.remove', id: pageId }]);
  expect(s.document.comments).toHaveLength(0);
  s.undo();
  expect(s.document.comments[0].pageId).toBe(pageId);
});
test('pre-comment checkpoints and journals open with an empty feedback collection', () => {
  const s = new DocumentStore();
  tx(s, [{ type: 'page.add', name: 'Existing page' }]);
  const cp: any = s.checkpoint();
  delete cp.base.comments;
  delete cp.document.comments;
  cp.journal.forEach((entry: any) => {
    if (entry.delta) {
      delete entry.delta.comments;
      delete entry.delta.removedComments;
    }
  });
  const restored = DocumentStore.fromCheckpoint(cp);
  expect(restored.document.comments).toEqual([]);
  restored.undo();
  expect(restored.document.pages).toHaveLength(1);
});

test('pinned anchors survive replay and undo; legacy page comments remain unpinned', () => {
  const s = new DocumentStore(),
    pageId = s.document.pages[0].id;
  tx(s, [{ type: 'comment.add', id: 'pin', pageId, text: 'Here', anchor: { x: -40.5, y: 120 } }]);
  const restored = DocumentStore.fromCheckpoint(s.checkpoint());
  expect(restored.document.comments[0].anchor).toEqual({ x: -40.5, y: 120 });
  restored.undo();
  expect(restored.document.comments).toHaveLength(0);
  restored.redo();
  expect(restored.document.comments[0].anchor).toEqual({ x: -40.5, y: 120 });
  for (const anchor of [{ x: Infinity, y: 0 }, { x: 1 }, { x: 0, y: NaN }])
    expect(() => tx(s, [{ type: 'comment.add', pageId, text: 'Bad', anchor }])).toThrow();
  tx(s, [{ type: 'comment.add', id: 'legacy', pageId, text: 'Page feedback' }]);
  const cp: any = s.checkpoint();
  delete cp.document.comments[1].anchor;
  for (const entry of cp.journal)
    if (entry.delta) for (const c of entry.delta.comments) if (c.id === 'legacy') delete c.anchor;
  expect(DocumentStore.fromCheckpoint(cp).document.comments[1].anchor).toBeNull();
});
