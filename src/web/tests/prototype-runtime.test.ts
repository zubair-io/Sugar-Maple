import { test, expect } from 'bun:test';
import { DocumentStore } from '../src/app/model/store';
import { PrototypeRuntime } from '../src/app/model/prototype-runtime';
import { inputDisplay } from '../src/app/model/form';
import { exportNode } from '../src/app/model/export';
const commit = (s: DocumentStore, operations: any[]) => s.transact({ documentId: s.document.id, expectedRevision: s.revision, requestId: crypto.randomUUID(), operations });
const fixture = () => {
  const s = new DocumentStore(), pageId = s.document.pages[0].id;
  commit(s, [
    { type: 'node.add', node: { id: 'login', pageId, kind: 'artboard' } },
    { type: 'node.add', node: { id: 'next', pageId, kind: 'artboard' } },
    { type: 'node.add', node: { id: 'overlay', pageId, kind: 'artboard' } },
    { type: 'node.add', node: { id: 'email', parentId: 'login', pageId, kind: 'input', inputType: 'email', initialValue: 'mock@example.test', accessibleLabel: 'Email' } },
    { type: 'node.add', node: { id: 'secret', parentId: 'login', pageId, kind: 'input', inputType: 'password', initialValue: 'Demo😀' } },
    { type: 'node.add', node: { id: 'disabled', parentId: 'login', pageId, kind: 'input', disabled: true, initialValue: 'Locked' } },
    { type: 'node.add', node: { id: 'open', parentId: 'login', pageId, kind: 'button', prototypeAction: 'openOverlay', targetId: 'overlay' } },
    { type: 'node.add', node: { id: 'go', parentId: 'login', pageId, kind: 'button', targetId: 'next' } },
    { type: 'node.add', node: { id: 'close', parentId: 'overlay', pageId, kind: 'button', prototypeAction: 'closeOverlay' } },
  ]);
  return s;
};
test('prototype values, navigation, overlays and reset never mutate the authored document or revision', () => {
  const s = fixture(), before = s.checkpoint(), runtime = new PrototypeRuntime();
  const node = (id: string) => s.document.nodes.find(n => n.id === id)!;
  runtime.start(s.document, 'login');
  expect(runtime.value(node('email'))).toBe('mock@example.test');
  runtime.set(node('email'), 'changed@example.test');
  runtime.set(node('disabled'), 'Should not change');
  expect(runtime.value(node('disabled'))).toBe('Locked');
  runtime.activate(s.document, node('open'));
  expect(runtime.overlays).toEqual(['overlay']);
  runtime.activate(s.document, node('close'));
  expect(runtime.overlays).toEqual([]);
  runtime.activate(s.document, node('go'));
  expect(runtime.currentId).toBe('next');
  runtime.back(); expect(runtime.currentId).toBe('login');
  expect(runtime.value(node('email'))).toBe('changed@example.test');
  runtime.reset(s.document); expect(runtime.value(node('email'))).toBe('mock@example.test');
  expect(s.checkpoint()).toEqual(before);
  expect(inputDisplay(node('secret'))).toBe('•••••');
});
test('deleted destinations, document replacement and overlay bounds fail with defined state', () => {
  const s = fixture(), runtime = new PrototypeRuntime(), open = s.document.nodes.find(n => n.id === 'open')!;
  runtime.start(s.document, 'login');
  for (let i = 0; i < 8; i++) expect(runtime.activate(s.document, open)).toBe(true);
  expect(runtime.activate(s.document, open)).toBe(false);
  expect(runtime.error).toContain('maximum eight');
  commit(s, [{ type: 'node.remove', id: 'overlay' }]);
  runtime.reconcile(s.document);
  expect(runtime.overlays).toEqual([]);
  expect(runtime.error).toContain('removed');
  expect(runtime.activate(s.document, s.document.nodes.find(n => n.id === 'open')!)).toBe(false);
  expect(runtime.error).toContain('no available destination');
  runtime.reconcile(new DocumentStore().document);
  expect(runtime.currentId).toBeNull();
  expect(runtime.values).toEqual({});
});
test('form semantics persist through recovery/undo and web/native export', () => {
  const s = fixture();
  const recovered = DocumentStore.fromCheckpoint(JSON.parse(JSON.stringify(s.checkpoint())));
  expect(recovered.document).toEqual(s.document);
  commit(recovered, [{ type: 'node.update', id: 'email', patch: { inputType: 'password', initialValue: 'Other', disabled: true } }]);
  recovered.undo(); expect(recovered.document).toEqual(s.document);
  for (const target of ['html', 'angular', 'tailwind'] as const) {
    const code = exportNode(s.document, 'email', target);
    expect(code).toContain('type="email"'); expect(code).toContain('aria-label="Email"'); expect(code).toContain('value="mock@example.test"');
    expect(exportNode(s.document, 'disabled', target)).toContain(' disabled');
    expect(exportNode(s.document, 'open', target)).toContain('data-maple-action="openOverlay"');
  }
  const swift = exportNode(s.document, 'login', 'swiftui');
  expect(swift).toContain('SecureField('); expect(swift).toContain('.textContentType(.emailAddress)');
  expect(swift).toMatch(/@State private var input_[\w]+ = "mock@example.test"/);
  expect(swift).toContain('.disabled(true)'); expect(swift).toContain('.accessibilityLabel(Text("Email"))');
  expect(exportNode(s.document, 'secret', 'svg')).not.toContain('Demo');
  const before = s.checkpoint();
  expect(() => commit(s, [{ type: 'node.update', id: 'email', patch: { inputType: 'tel' } }])).toThrow();
  expect(() => commit(s, [{ type: 'node.update', id: 'email', patch: { initialValue: 'two\nlines' } }])).toThrow();
  expect(s.checkpoint()).toEqual(before);
});
