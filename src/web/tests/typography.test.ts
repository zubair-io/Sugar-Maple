import { test, expect } from 'bun:test';
import { DocumentStore } from '../src/app/model/store';
import { NodeSchema, uid } from '../src/app/model/schema';
import { exportNode, nodeStyles } from '../src/app/model/export';
import { pasteElements } from '../src/app/model/clipboard';
import { loadBundledFont } from '../src/app/model/bundled-font-access';
import { project, wrapText } from '../src/app/canvas/scene-layout';
import { svgExport } from '../src/app/model/svg';
await loadBundledFont(
  async () =>
    new Uint8Array(
      await Bun.file(new URL('../public/fonts/InterVariable.woff2', import.meta.url)).arrayBuffer(),
    ),
);
const commit = (s: DocumentStore, operations: any[]) =>
  s.transact({
    documentId: s.document.id,
    expectedRevision: s.revision,
    requestId: uid(),
    operations,
  });
test('native CR and CRLF line endings retain authored text with LF-equivalent Canvas and SVG geometry', () => {
  const document = new DocumentStore().document, pageId = document.pages[0].id;
  const node = NodeSchema.parse({ id: 'native-lines', name: 'Native lines', pageId, kind: 'text', text: 'café\nline x2', widthMode: 'hug', heightMode: 'hug' });
  const layout = (text: string) => project({ ...document, nodes: [{ ...node, text }] }, pageId)[0];
  const svg = (text: string) => svgExport({ ...document, nodes: [{ ...node, text, widthMode: 'fixed', heightMode: 'fixed' }] }, node.id);
  const reference = layout(node.text);
  for (const text of ['café\rline x2', 'café\r\nline x2']) {
    expect(wrapText(text, 1000, value => value.length)).toEqual(['café', 'line x2']);
    const result = layout(text);
    expect([result.width, result.height]).toEqual([reference.width, reference.height]);
    expect(result.node.text).toBe(text);
    expect(svg(text)).toBe(svg(node.text));
  }
});
test('typography migrates old journals without changing retry identity or undo', () => {
  const s = new DocumentStore(),
    pageId = s.document.pages[0].id;
  const tx = {
    documentId: s.document.id,
    expectedRevision: 0,
    requestId: uid(),
    operations: [{ type: 'node.add', node: { id: 'label', pageId, kind: 'text', text: 'Legacy' } }],
  };
  const receipt = s.transact(tx),
    old: any = JSON.parse(JSON.stringify(s.checkpoint()));
  const remove = (value: any) => {
    if (!value || typeof value !== 'object') return;
    if (value.kind)
      for (const key of ['fontFamily', 'lineHeight', 'letterSpacing', 'textAlign'])
        delete value[key];
    for (const v of Object.values(value)) remove(v);
  };
  remove(old);
  const restored = DocumentStore.fromCheckpoint(old);
  expect(restored.document.nodes[0].fontFamily).toBe('system-ui');
  expect(restored.document.nodes[0].lineHeight).toBe(1.2);
  expect(restored.transact(tx)).toEqual(receipt);
  commit(restored, [
    {
      type: 'node.update',
      id: 'label',
      patch: { fontFamily: 'Maple Sans', lineHeight: 1.6, letterSpacing: 1, textAlign: 'right' },
    },
  ]);
  restored.undo();
  expect(restored.document.nodes[0].textAlign).toBe('auto');
  restored.redo();
  expect(DocumentStore.fromCheckpoint(restored.checkpoint()).document).toEqual(restored.document);
});
test('component typography and token references survive override, reset and cross-file editable paste', () => {
  const s = new DocumentStore(),
    pageId = s.document.pages[0].id;
  commit(s, [
    { type: 'token.set', name: 'brand', value: '#112233' },
    {
      type: 'node.add',
      node: {
        id: 'master',
        pageId,
        kind: 'text',
        isComponent: true,
        fontFamily: 'monospace',
        fillToken: 'brand',
      },
    },
    { type: 'component.insert', id: 'master', pageId },
  ]);
  const id = s.document.nodes.find((n) => n.componentId === 'master')!.id;
  commit(s, [
    { type: 'node.update', id, patch: { letterSpacing: 2 } },
    {
      type: 'node.update',
      id: 'master',
      patch: { fontFamily: 'serif', letterSpacing: 1, lineHeight: 1.8, textAlign: 'center' },
    },
  ]);
  expect(s.document.nodes.find((n) => n.id === id)!.letterSpacing).toBe(2);
  const destination = new DocumentStore();
  const paste = pasteElements(
    destination.document,
    destination.document.pages[0].id,
    exportNode(s.document, id, 'editable'),
  );
  commit(destination, paste.operations);
  const copied = destination.document.nodes.find((n) => n.id === paste.rootId)!;
  expect([
    copied.fontFamily,
    copied.lineHeight,
    copied.letterSpacing,
    copied.textAlign,
    copied.fillToken,
  ]).toEqual(['serif', 1.8, 2, 'center', 'brand']);
  commit(destination, [{ type: 'component.reset', id: copied.id }]);
  expect(destination.document.nodes.find((n) => n.id === copied.id)!.letterSpacing).toBe(1);
});
test('hug height, web typography and native rejection use the same authored values', () => {
  const s = new DocumentStore(),
    pageId = s.document.pages[0].id;
  commit(s, [
    {
      type: 'node.add',
      node: {
        id: 'text',
        pageId,
        kind: 'text',
        fontFamily: 'Maple Sans',
        text: 'One\nTwo',
        fontSize: 20,
        lineHeight: 1.8,
        letterSpacing: 1,
        textAlign: 'center',
        heightMode: 'hug',
      },
    },
  ]);
  expect(project(s.document, pageId)[0].height).toBe(72);
  expect(nodeStyles(s.document.nodes[0], s.document).lineHeight).toBe('1.8');
  for (const target of ['html', 'angular', 'tailwind'] as const) {
    const code = exportNode(s.document, 'text', target);
    expect(code).toContain('data:font/woff2;base64,');
    expect(code).toContain('SIL OPEN FONT LICENSE');
    expect(code).toContain(target === 'tailwind' ? '[letter-spacing:1px]' : 'letter-spacing:1px');
  }
  expect(() => exportNode(s.document, 'text', 'swiftui')).toThrow('responsive sizing');
  commit(s, [{ type: 'node.update', id: 'text', patch: { heightMode: 'fixed' } }]);
  expect(() => exportNode(s.document, 'text', 'swiftui')).toThrow('font registration');
  commit(s, [{ type: 'node.update', id: 'text', patch: { fontFamily: 'monospace' } }]);
  expect(() => exportNode(s.document, 'text', 'swiftui')).toThrow('line-height');
  commit(s, [{ type: 'node.update', id: 'text', patch: { lineHeight: 1.2 } }]);
  const swift = exportNode(s.document, 'text', 'swiftui');
  expect(swift).toContain('design: .monospaced');
  expect(swift).toContain('.tracking(1)');
  expect(swift).toContain('.multilineTextAlignment(.center)');
  for (const family of ['bad; color: red', '</style>', 'url(https://x)', 'Bad"Family'])
    expect(() => NodeSchema.parse({ ...s.document.nodes[0], fontFamily: family })).toThrow();
});
