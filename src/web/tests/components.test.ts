import { test, expect } from 'bun:test';
import { DocumentStore } from '../src/app/model/store';
import { uid } from '../src/app/model/schema';
const commit = (s: DocumentStore, operations: any[]) =>
  s.transact({
    documentId: s.document.id,
    expectedRevision: s.revision,
    requestId: uid(),
    operations,
  });
test('instances follow added, reparented and deleted master layers and preserve overrides', () => {
  const s = new DocumentStore(),
    pageId = s.document.pages[0].id;
  commit(s, [
    { type: 'node.add', node: { id: 'master', pageId, kind: 'frame' } },
    {
      type: 'node.add',
      node: { id: 'label', pageId, kind: 'text', parentId: 'master', text: 'Original', x: 10 },
    },
    { type: 'component.create', id: 'master' },
    { type: 'component.insert', id: 'master', pageId, x: 400, y: 0 },
  ]);
  const root = s.document.nodes.find((n) => n.componentId === 'master')!,
    label = s.document.nodes.find((n) => n.componentId === 'label')!;
  commit(s, [{ type: 'node.update', id: label.id, patch: { text: 'Local' } }]);
  commit(s, [
    { type: 'node.add', node: { id: 'inner', pageId, kind: 'frame', parentId: 'master', x: 20 } },
    { type: 'node.update', id: 'label', patch: { parentId: 'inner', x: 30 } },
  ]);
  const inner = s.document.nodes.find((n) => n.componentId === 'inner')!;
  expect(s.document.nodes.find((n) => n.id === label.id)).toMatchObject({
    parentId: inner.id,
    text: 'Local',
    x: 30,
  });
  expect(s.document.nodes.find((n) => n.id === root.id)?.x).toBe(400);
  commit(s, [{ type: 'node.remove', id: 'inner' }]);
  expect(s.document.nodes.some((n) => n.id === inner.id || n.id === label.id)).toBe(false);
  const restored = DocumentStore.fromCheckpoint(s.checkpoint());
  restored.undo();
  expect(restored.document.nodes.find((n) => n.id === label.id)?.text).toBe('Local');
});
test('named variants preserve local text overrides and reset restores inherited values', () => {
  const s = new DocumentStore(),
    pageId = s.document.pages[0].id;
  commit(s, [
    {
      type: 'node.add',
      node: {
        id: 'master',
        pageId,
        kind: 'button',
        text: 'Continue',
        fill: '#2563eb',
        variants: { Danger: { fill: '#ff0000', text: 'Delete' } },
      },
    },
    { type: 'component.create', id: 'master' },
    { type: 'component.insert', id: 'master', pageId, x: 300, y: 80 },
  ]);
  const instance = s.document.nodes.find((n) => n.componentId === 'master')!;
  commit(s, [
    { type: 'node.update', id: instance.id, patch: { text: 'My label' } },
    { type: 'component.variant', id: instance.id, name: 'Danger' },
  ]);
  expect(s.document.nodes.find((n) => n.id === instance.id)).toMatchObject({
    fill: '#ff0000',
    text: 'My label',
    x: 300,
  });
  commit(s, [{ type: 'node.update', id: 'master', patch: { fill: '#000000' } }]);
  expect(s.document.nodes.find((n) => n.id === instance.id)?.fill).toBe('#ff0000');
  commit(s, [{ type: 'component.reset', id: instance.id }]);
  expect(s.document.nodes.find((n) => n.id === instance.id)).toMatchObject({
    text: 'Delete',
    x: 300,
    overrides: [],
  });
  commit(s, [{ type: 'component.variant', id: instance.id, name: 'Default' }]);
  expect(s.document.nodes.find((n) => n.id === instance.id)).toMatchObject({
    text: 'Continue',
    fill: '#000000',
  });
});
test('nested definitions synchronize in dependency order and recursive containment rejects', () => {
  const s = new DocumentStore(),
    pageId = s.document.pages[0].id;
  commit(s, [
    { type: 'node.add', node: { id: 'outer', pageId, kind: 'frame', isComponent: true } },
    { type: 'node.add', node: { id: 'inner', pageId, kind: 'frame', isComponent: true } },
    { type: 'component.insert', id: 'inner', pageId, x: 0, y: 0 },
  ]);
  const innerInstance = s.document.nodes.find((n) => n.componentId === 'inner')!;
  commit(s, [
    { type: 'node.update', id: innerInstance.id, patch: { parentId: 'outer' } },
    { type: 'component.insert', id: 'outer', pageId, x: 400, y: 0 },
  ]);
  commit(s, [
    {
      type: 'node.add',
      node: { id: 'nested-label', pageId, parentId: 'inner', kind: 'text', text: 'Nested' },
    },
  ]);
  expect(s.document.nodes.filter((n) => n.text === 'Nested')).toHaveLength(3);
  const unchanged = s.document;
  expect(() =>
    commit(s, [{ type: 'node.update', id: 'outer', patch: { parentId: 'inner' } }]),
  ).toThrow('Recursive');
  expect(s.document).toEqual(unchanged);
  const inherited = s.document.nodes.find((n) => n.componentId === 'nested-label')!;
  expect(() => commit(s, [{ type: 'node.remove', id: inherited.id }])).toThrow('Detach');
});
