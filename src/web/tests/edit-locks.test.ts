import { expect, test } from 'bun:test';
import { assertHumanEdits, lockingNode } from '../src/app/model/edit-locks';
import { blankDocument, NodeSchema, type Operation } from '../src/app/model/schema';
import { DocumentStore } from '../src/app/model/store';
function fixture() {
  const doc = blankDocument(), pageId = doc.pages[0].id;
  doc.nodes = [
    { id: 'outer', name: 'Outer', kind: 'frame' },
    { id: 'parent', name: 'Locked parent', kind: 'frame', parentId: 'outer', locked: true },
    { id: 'child', name: 'Child', kind: 'text', parentId: 'parent', text: 'Protected' },
    { id: 'free', name: 'Free', kind: 'rectangle', x: 400 },
    { id: 'hidden', name: 'Hidden', kind: 'text', hidden: true },
  ].map(node => NodeSchema.parse({ pageId, ...node }));
  return new DocumentStore(doc);
}
function human(store: DocumentStore, operations: Operation[]) {
  assertHumanEdits(store.document, operations);
  return store.transact({ documentId: store.document.id, expectedRevision: store.revision,
    requestId: crypto.randomUUID(), operations }, 'human');
}
test('lock owner is inherited, nearest and absent for independent or missing nodes', () => {
  const store = fixture(), nodes = new Map(store.document.nodes.map(node => [node.id, node]));
  expect(lockingNode(nodes, 'child')!.id).toBe('parent');
  expect(lockingNode(nodes, 'free')).toBeNull(); expect(lockingNode(nodes, null)).toBeNull();
  nodes.get('child')!.locked = true; expect(lockingNode(nodes, 'child')!.id).toBe('child');
});
test('direct Inspector edits, parent insertion and structural/registry actions respect inherited locks', () => {
  const store = fixture(), pageId = store.document.pages[0].id;
  const operations: Operation[] = [
    { type: 'node.update', id: 'child', patch: { text: 'Changed' } },
    { type: 'node.update', id: 'child', patch: { order: 12 } },
    { type: 'node.add', node: { kind: 'rectangle', pageId, parentId: 'parent' } },
    { type: 'node.update', id: 'free', patch: { parentId: 'parent' } },
    { type: 'component.create', id: 'child' }, { type: 'component.detach', id: 'child' },
    { type: 'component.reset', id: 'child' }, { type: 'component.variant', id: 'child', name: 'Hover' },
    { type: 'repeat.prepare', id: 'child' }, { type: 'repeat.resize', id: 'child', rows: 2, columns: 2 },
    { type: 'repeat.populate', id: 'child', values: ['Changed'] },
    { type: 'repeat.import', id: 'child', rows: [{ label: 'Changed' }],
      fields: [{ field: 'label', targetId: 'child', property: 'text' }], missing: 'retain', truncate: false },
    { type: 'library.props', id: 'child', props: { label: 'Changed' } },
    { type: 'library.reset', id: 'child' }, { type: 'library.remap', id: 'child', key: 'system@1.0.0' },
  ];
  const before = store.checkpoint();
  for (const operation of operations) expect(() => human(store, [operation])).toThrow('Locked parent');
  expect(store.checkpoint()).toEqual(before);
});
test('one protected member rejects an entire mixed delete/edit batch without history or partial work', () => {
  const store = fixture(), before = store.checkpoint();
  expect(() => human(store, [{ type: 'node.remove', id: 'free' }, { type: 'node.remove', id: 'child' }])).toThrow('Unlock');
  expect(() => human(store, [{ type: 'document.rename', name: 'Should not change' },
    { type: 'node.update', id: 'child', patch: { fill: '#ff0000' } }])).toThrow('Unlock');
  expect(store.checkpoint()).toEqual(before); expect(store.revision).toBe(0);
});
test('deleting an unlocked container or page cannot erase contained locked content', () => {
  const store = fixture(), before = store.checkpoint();
  expect(() => human(store, [{ type: 'node.remove', id: 'outer' }])).toThrow('before deleting its container');
  expect(() => human(store, [{ type: 'page.remove', id: store.document.pages[0].id }])).toThrow('before deleting its page');
  expect(store.checkpoint()).toEqual(before);
});
test('explicit lock/visibility controls stay available and unlocking permits the next edit with independent undo', () => {
  const store = fixture(), before = store.document;
  human(store, [{ type: 'node.update', id: 'child', patch: { hidden: true } }]);
  expect(() => human(store, [{ type: 'node.update', id: 'parent', patch: { locked: false, name: 'Combined edit' } }])).toThrow('Unlock');
  human(store, [{ type: 'node.update', id: 'parent', patch: { locked: false } }]);
  human(store, [{ type: 'node.update', id: 'child', patch: { text: 'Changed intentionally' } }]);
  expect(store.revision).toBe(3);
  store.undo(); expect(store.document.nodes.find(node => node.id === 'child')!.text).toBe('Protected');
  store.undo(); expect(store.document.nodes.find(node => node.id === 'parent')!.locked).toBe(true);
  store.undo(); expect(store.document).toEqual(before);
});
test('hidden unlocked layers, feedback, tokens and copy insertion keep their independent semantics', () => {
  const document = fixture().document, pageId = document.pages[0].id;
  document.nodes.find(node => node.id === 'parent')!.isComponent = true;
  const store = new DocumentStore(document), before = store.document;
  human(store, [
    { type: 'node.update', id: 'hidden', patch: { text: 'Intentional hidden edit' } },
    { type: 'comment.add', pageId, text: 'Feedback on the locked scene' },
    { type: 'token.set', name: 'brand', value: '#2563eb' },
    { type: 'component.insert', id: 'parent', pageId, x: 40, y: 40 },
    { type: 'node.add', node: { id: 'fresh', kind: 'frame', pageId, locked: true } },
    { type: 'node.add', node: { kind: 'text', pageId, parentId: 'fresh' } },
  ]);
  expect(store.revision).toBe(1);
  expect(store.document.nodes.find(node => node.id === 'hidden')!.text).toBe('Intentional hidden edit');
  expect(store.document.nodes.some(node => node.componentId === 'parent')).toBe(true);
  expect(store.document.nodes.find(node => node.parentId === 'fresh')).toBeDefined();
  store.undo(); expect(store.document).toEqual(before);
});
test('explicit agent transactions can edit locked content and remain one undoable batch', () => {
  const store = fixture(), before = store.document;
  store.transact({ documentId: store.document.id, expectedRevision: 0, requestId: 'agent-explicit',
    operations: [{ type: 'node.update', id: 'child', patch: { text: 'Agent edit' } }] }, 'agent');
  expect(store.document.nodes.find(node => node.id === 'child')!.text).toBe('Agent edit');
  store.undo(); expect(store.document).toEqual(before);
});
