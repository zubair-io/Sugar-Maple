import { test, expect } from 'bun:test';
import { DocumentStore } from '../src/app/model/store';
import { uid } from '../src/app/model/schema';
const tx = (s: DocumentStore, operations: any[]) => ({
  documentId: s.document.id,
  expectedRevision: s.revision,
  requestId: uid(),
  operations,
});
test('create a file, pages and nested items, edit, undo, and reopen checkpoint', () => {
  const s = new DocumentStore();
  const page = s.document.pages[0].id;
  const frame = uid();
  s.transact(
    tx(s, [
      { type: 'page.add', name: 'Checkout' },
      { type: 'node.add', node: { id: frame, kind: 'artboard', pageId: page, name: 'Sign in' } },
    ]),
  );
  const r = s.transact(
    tx(s, [
      { type: 'node.add', node: { kind: 'text', pageId: page, parentId: frame, text: 'Welcome' } },
    ]),
  );
  s.transact(tx(s, [{ type: 'node.update', id: r.ids[0], patch: { x: 42 } }]));
  s.undo();
  expect(s.document.nodes[1].x).toBe(0);
  s.redo();
  expect(s.document.nodes[1].x).toBe(42);
  const reopened = new DocumentStore(JSON.parse(JSON.stringify(s.checkpoint().document)));
  expect(reopened.document).toEqual(s.document);
});
test('invalid batch and parent cycles leave the document unchanged', () => {
  const s = new DocumentStore(),
    before = s.document;
  expect(() =>
    s.transact(
      tx(s, [
        { type: 'page.add', name: 'Two' },
        { type: 'node.add', node: { kind: 'text', pageId: 'missing' } },
      ]),
    ),
  ).toThrow();
  expect(s.document).toEqual(before);
  expect(s.revision).toBe(0);
});
test('retries are idempotent, revisions and document identities protect targeting', () => {
  const s = new DocumentStore(),
    t = tx(s, [{ type: 'page.add', name: 'Two' }]);
  expect(s.transact(t)).toEqual(s.transact(t));
  expect(s.document.pages.length).toBe(2);
  expect(() => s.transact({ ...t, requestId: uid() })).toThrow('Stale');
  expect(() =>
    s.transact({ ...tx(s, [{ type: 'page.add', name: 'Three' }]), documentId: 'wrong' }),
  ).toThrow('Wrong');
});
test('grouped agent undo retains prior human edits', () => {
  const s = new DocumentStore();
  s.transact(tx(s, [{ type: 'document.rename', name: 'Human title' }]));
  s.transact(
    tx(s, [
      { type: 'page.add', name: 'Agent 1' },
      { type: 'page.add', name: 'Agent 2' },
    ]),
    'agent',
  );
  s.undo();
  expect(s.document.name).toBe('Human title');
  expect(s.document.pages.length).toBe(1);
});

test('updating geometry preserves text, size, appearance and hierarchy', () => {
  const s = new DocumentStore(),
    pageId = s.document.pages[0].id;
  const r = s.transact(
    tx(s, [
      {
        type: 'node.add',
        node: { kind: 'text', pageId, text: 'Keep this', width: 321, fill: '#123456' },
      },
    ]),
  );
  const before = s.document.nodes[0];
  s.transact(tx(s, [{ type: 'node.update', id: r.ids[0], patch: { x: 50 } }]));
  expect(s.document.nodes[0]).toEqual({ ...before, x: 50 });
});
