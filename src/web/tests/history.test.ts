import { test, expect } from 'bun:test';
import { DocumentStore } from '../src/app/model/store';
import { uid } from '../src/app/model/schema';
const commit = (s: DocumentStore, operations: any[]) => {
  const tx = {
    documentId: s.document.id,
    expectedRevision: s.revision,
    requestId: uid(),
    operations,
  };
  return { tx, result: s.transact(tx) };
};
test('durable journal preserves grouped undo, redo branch and idempotent retries', () => {
  const s = new DocumentStore(),
    pageId = s.document.pages[0].id;
  commit(s, [{ type: 'node.add', node: { id: 'a', pageId, kind: 'text', text: 'Original' } }]);
  const last = commit(s, [
    { type: 'node.update', id: 'a', patch: { text: 'Changed' } },
    { type: 'node.add', node: { id: 'b', pageId, kind: 'rectangle' } },
  ]);
  s.undo();
  const reopened = DocumentStore.fromCheckpoint(JSON.parse(JSON.stringify(s.checkpoint())));
  expect(reopened.document).toEqual(s.document);
  expect(reopened.revision).toBe(3);
  expect(reopened.canRedo).toBe(true);
  reopened.redo();
  expect(reopened.document.nodes.length).toBe(2);
  expect(reopened.document.nodes[0].text).toBe('Changed');
  expect(reopened.transact(last.tx)).toEqual(last.result);
  reopened.undo();
  reopened.undo();
  expect(reopened.document.nodes).toEqual([]);
  reopened.redo();
  commit(reopened, [{ type: 'node.update', id: 'a', patch: { text: 'New branch' } }]);
  const again = DocumentStore.fromCheckpoint(reopened.checkpoint());
  expect(again.canRedo).toBe(false);
  again.undo();
  expect(again.document.nodes[0].text).toBe('Original');
});
test('checkpoint is immutable; corrupt projections and unknown versions reject', () => {
  const s = new DocumentStore(),
    snapshot = s.checkpoint();
  commit(s, [{ type: 'page.add', name: 'Later' }]);
  expect(snapshot.journal.length).toBe(0);
  expect(DocumentStore.fromCheckpoint(snapshot).document.pages.length).toBe(1);
  const corrupt = s.checkpoint();
  corrupt.document.name = 'Tampered';
  expect(() => DocumentStore.fromCheckpoint(corrupt)).toThrow('projection');
  expect(() => DocumentStore.fromCheckpoint({ ...snapshot, checkpointVersion: 99 })).toThrow(
    'version',
  );
  expect(DocumentStore.fromCheckpoint({ document: snapshot.document }).document).toEqual(
    snapshot.document,
  );
});
test('5,000-node checkpoint round-trips and retains an undoable last batch', () => {
  const s = new DocumentStore(),
    pageId = s.document.pages[0].id;
  for (let batch = 0; batch < 10; batch++)
    commit(
      s,
      Array.from({ length: 500 }, (_, i) => ({
        type: 'node.add',
        node: {
          id: `node-${batch * 500 + i}`,
          pageId,
          kind: 'rectangle',
          x: i * 2,
          y: batch * 10,
          width: 10,
          height: 10,
        },
      })),
    );
  const json = JSON.stringify(s.checkpoint());
  expect(new TextEncoder().encode(json).length).toBeLessThan(32_000_000);
  const restored = DocumentStore.fromCheckpoint(JSON.parse(json));
  expect(restored.document).toEqual(s.document);
  restored.undo();
  expect(restored.document.nodes.length).toBe(4500);
});
