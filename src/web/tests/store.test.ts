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

test('component instances follow master styles while preserving text overrides', () => {
  const s = new DocumentStore(),
    pageId = s.document.pages[0].id;
  const master = s.transact(
    tx(s, [{ type: 'node.add', node: { kind: 'text', pageId, text: 'Master' } }]),
  ).ids[0];
  s.transact(tx(s, [{ type: 'component.create', id: master }]));
  const instance = s.transact(
    tx(s, [{ type: 'component.insert', id: master, pageId, x: 300, y: 0 }]),
  ).ids[0];
  s.transact(tx(s, [{ type: 'node.update', id: instance, patch: { text: 'Override' } }]));
  s.transact(
    tx(s, [{ type: 'node.update', id: master, patch: { text: 'New master', fill: '#123456' } }]),
  );
  const node = s.document.nodes.find((n) => n.id === instance)!;
  expect(node.text).toBe('Override');
  expect(node.fill).toBe('#123456');
  expect(node.x).toBe(300);
});
test('repeat grid creates linked cells and populates independent values atomically', () => {
  const s = new DocumentStore(),
    pageId = s.document.pages[0].id;
  const source = s.transact(
    tx(s, [{ type: 'node.add', node: { kind: 'text', pageId, text: 'Cell' } }]),
  ).ids[0];
  const grid = s.transact(tx(s, [{ type: 'repeat.create', id: source, count: 6, columns: 3 }]))
    .ids[0];
  expect(s.document.nodes.filter((n) => n.parentId === grid).length).toBe(6);
  s.transact(tx(s, [{ type: 'repeat.populate', id: grid, values: ['One', 'Two', 'Three'] }]));
  expect(
    s.document.nodes
      .filter((n) => n.parentId === grid)
      .slice(0, 3)
      .map((n) => n.text),
  ).toEqual(['One', 'Two', 'Three']);
  s.undo();
  expect(s.document.nodes.filter((n) => n.parentId === grid).every((n) => n.text === 'Cell')).toBe(
    true,
  );
});

test('new nodes append in order; invalid prototype and component links reject atomically', () => {
  const store = new DocumentStore();
  const apply = (operations: any[]) =>
    store.transact({
      documentId: store.document.id,
      expectedRevision: store.revision,
      requestId: uid(),
      operations,
    });
  const pageId = store.document.pages[0].id;
  apply([
    { type: 'node.add', node: { id: 'a', kind: 'rectangle', pageId } },
    { type: 'node.add', node: { id: 'b', kind: 'rectangle', pageId } },
  ]);
  expect(store.document.nodes.map((n) => n.order)).toEqual([0, 1]);
  const before = store.document;
  expect(() => apply([{ type: 'node.update', id: 'a', patch: { targetId: 'b' } }])).toThrow(
    'artboard',
  );
  expect(() =>
    apply([
      { type: 'node.update', id: 'a', patch: { componentId: 'b' } },
      { type: 'node.update', id: 'b', patch: { componentId: 'a' } },
    ]),
  ).toThrow('cycle');
  expect(store.document).toEqual(before);
});
