import { test, expect } from 'bun:test';
import { DocumentStore } from '../src/app/model/store';
import { uid } from '../src/app/model/schema';
import { exportNode, nodeStyles } from '../src/app/model/export';
import { pasteElements } from '../src/app/model/clipboard';
const commit = (s: DocumentStore, operations: any[]) => s.transact({ documentId: s.document.id, expectedRevision: s.revision, requestId: uid(), operations });

test('literal variant replaces inherited token, token variant binds, and local overrides win through undo', () => {
  const s = new DocumentStore(), pageId = s.document.pages[0].id;
  commit(s, [
    { type: 'token.set', name: 'brand', value: '#6633ff' },
    { type: 'token.set', name: 'danger', value: '#cc0000' },
    { type: 'node.add', node: { id: 'master', pageId, kind: 'button', isComponent: true, fillToken: 'brand', variants: { Danger: { fill: '#ff0000' }, Token: { fillToken: 'danger' } } } },
    { type: 'component.insert', id: 'master', pageId },
  ]);
  const id = s.document.nodes.find(n => n.componentId === 'master')!.id;
  const fill = () => nodeStyles(s.document.nodes.find(n => n.id === id)!, s.document).background;
  commit(s, [{ type: 'component.variant', id, name: 'Danger' }]);
  expect(fill()).toBe('#ff0000');
  commit(s, [{ type: 'token.set', name: 'brand', value: '#0000ff' }]);
  expect(fill()).toBe('#ff0000');
  commit(s, [{ type: 'component.variant', id, name: 'Token' }]);
  expect(fill()).toBe('#cc0000');
  commit(s, [{ type: 'node.update', id, patch: { fill: '#00ff00', fillToken: '' } }, { type: 'component.variant', id, name: 'Danger' }]);
  expect(fill()).toBe('#00ff00');
  s.undo(); expect(fill()).toBe('#cc0000');
  commit(s, [{ type: 'component.variant', id, name: 'Default' }]);
  expect(fill()).toBe('#0000ff');
});

test('cross-document clipboard includes nested masters and preserves variant, overrides and token collisions atomically', () => {
  const source = new DocumentStore(), pageId = source.document.pages[0].id;
  commit(source, [
    { type: 'token.set', name: 'brand', value: '#6633ff' },
    { type: 'node.add', node: { id: 'button', pageId, kind: 'button', isComponent: true, text: 'Continue', fillToken: 'brand', variants: { Danger: { fill: '#ff0000' } } } },
    { type: 'node.add', node: { id: 'card', pageId, kind: 'frame', isComponent: true } },
    { type: 'component.insert', id: 'button', pageId },
  ]);
  const nested = source.document.nodes.find(n => n.componentId === 'button')!.id;
  commit(source, [{ type: 'node.update', id: nested, patch: { parentId: 'card' } }, { type: 'component.insert', id: 'card', pageId }]);
  const card = source.document.nodes.find(n => n.componentId === 'card')!;
  commit(source, [{ type: 'node.update', id: card.id, patch: { name: 'Local card' } }]);
  const destination = new DocumentStore();
  commit(destination, [{ type: 'token.set', name: 'brand', value: '#000000' }]);
  const before = destination.document;
  const paste = pasteElements(destination.document, destination.document.pages[0].id, exportNode(source.document, card.id, 'editable'));
  commit(destination, paste.operations);
  const imported = destination.document.nodes.find(n => n.id === paste.rootId)!;
  expect(imported.componentId).not.toBeNull();
  expect(imported.name).toBe('Local card');
  expect(imported.overrides).toContain('name');
  expect(destination.document.nodes.filter(n => n.isComponent)).toHaveLength(2);
  expect(destination.document.tokens.brand).toBe('#000000');
  expect(destination.document.tokens.brand_copy1).toBe('#6633ff');
  const importedButton = destination.document.nodes.find(n => n.isComponent && n.kind === 'button')!;
  commit(destination, [{ type: 'node.update', id: importedButton.id, patch: { text: 'Updated' } }]);
  expect(destination.document.nodes.filter(n => n.kind === 'button').every(n => n.text === 'Updated')).toBe(true);
  destination.undo(); destination.undo(); expect(destination.document).toEqual(before);
});

test('legacy incomplete clipboard fails rather than silently detaching', () => {
  const s = new DocumentStore();
  const text = JSON.stringify({ format: 'sugar-maple-elements', version: 1, nodes: [{ id: 'instance', pageId: s.document.pages[0].id, kind: 'button', name: 'Button', componentId: 'missing' }] });
  expect(() => pasteElements(s.document, s.document.pages[0].id, text)).toThrow('Missing component master');
});
