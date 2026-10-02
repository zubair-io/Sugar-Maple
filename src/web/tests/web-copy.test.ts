import { test, expect } from 'bun:test';
import { blankDocument, NodeSchema, validateDocument } from '../src/app/model/schema';
import { exportNode } from '../src/app/model/export';
import { exportSupport } from '../src/app/model/export';
import { DocumentStore } from '../src/app/model/store';

function fixture() {
  const doc = blankDocument(),
    pageId = doc.pages[0].id;
  doc.tokens['brand.primary'] = '#2468ac';
  doc.nodes = [
    NodeSchema.parse({
      id: 'card',
      pageId,
      kind: 'frame',
      name: 'Authored Card',
      layout: 'vertical',
      width: 360,
      height: 180,
      padding: 12,
      strokeWidth: 2.5,
    }),
    NodeSchema.parse({
      id: 'action',
      pageId,
      parentId: 'card',
      kind: 'button',
      name: 'Continue action',
      text: 'Continue & <next>',
      widthMode: 'fill',
      fillToken: 'brand.primary',
      height: 44,
    }),
    NodeSchema.parse({
      id: 'hidden',
      pageId,
      parentId: 'card',
      kind: 'frame',
      name: 'Hidden',
      hidden: true,
      text: 'HIDDEN_EXPORT_CANARY',
    }),
    NodeSchema.parse({
      id: 'hidden-child',
      pageId,
      parentId: 'hidden',
      kind: 'text',
      name: 'Visible child inside hidden parent',
      text: 'HIDDEN_DESCENDANT_EXPORT_CANARY',
    }),
  ];
  return doc;
}
test('classes and declaration payloads are pasteable fragments with token identity and no markup', () => {
  const doc = fixture();
  const classes = exportNode(doc, 'action', 'tailwind-classes' as any);
  expect(classes).toContain('[background:var(--brand-primary)]');
  expect(classes).not.toContain('<button');
  expect(classes).not.toContain('class=');
  const declarations = exportNode(doc, 'action', 'css-declarations' as any);
  expect(declarations).toContain('--brand-primary:#2468ac');
  expect(declarations).toContain('background:var(--brand-primary)');
  expect(declarations).not.toContain('.node-');
  expect(declarations).not.toContain('{');
  expect(exportNode(doc, 'action', 'html')).toContain('Continue &amp; &lt;next&gt;');
});
test('complete CSS rules cover visible descendants and packaged markup references those exact rules', () => {
  const doc = fixture(),
    before = JSON.stringify(doc);
  const css = exportNode(doc, 'card', 'css');
  expect(css).toContain('.node-card{');
  expect(css).toContain('.node-action{');
  expect(css).not.toContain('.node-hidden{');
  expect(css).not.toContain('.node-hidden-child{');
  const markup = exportNode(doc, 'card', 'html-css' as any);
  expect(markup).toContain('<style>');
  expect(markup).toContain('class="node-action"');
  expect(markup).toContain('Continue &amp; &lt;next&gt;');
  expect(markup).not.toContain('style="');
  expect(markup).not.toContain('class="node-hidden"');
  expect(markup).not.toContain('class="node-hidden-child"');
  expect(markup).not.toContain('HIDDEN_EXPORT_CANARY');
  expect(markup).not.toContain('HIDDEN_DESCENDANT_EXPORT_CANARY');
  expect(JSON.stringify(doc)).toBe(before);
});

test('malformed token names cannot escape declaration or stylesheet boundaries', () => {
  const doc = fixture();
  doc.nodes[1].fillToken = 'brand;}body{background:red';
  for (const target of ['html', 'tailwind-classes', 'css-declarations', 'css', 'html-css'] as const)
    expect(() => exportNode(doc, 'action', target)).toThrow('Unsupported fill token name');
});

test('invalid token colors reject at authoring/loading and at the public export helper boundary', () => {
  for (const value of [
    '</style><script>globalThis.injected=true</script>',
    'red;}body{display:none',
    'url(data:image/png;base64,AA==)',
  ]) {
    const doc = fixture(),
      store = new DocumentStore(doc),
      before = store.checkpoint();
    expect(() =>
      store.transact({
        documentId: doc.id,
        expectedRevision: 0,
        requestId: crypto.randomUUID(),
        operations: [{ type: 'token.set', name: 'brand.primary', value }],
      }),
    ).toThrow();
    expect(store.checkpoint()).toEqual(before);
    doc.tokens['brand.primary'] = value;
    expect(() => new DocumentStore(doc)).toThrow();
    for (const target of ['tailwind-classes', 'css-declarations', 'css', 'html-css'] as const)
      expect(() => exportNode(doc, 'action', target)).toThrow();
  }
});

test('fragment support inspects only its selected node even on a deeply nested valid document', () => {
  const doc = fixture();
  for (let i = 0; i < 5000; i++)
    doc.nodes.push(
      NodeSchema.parse({
        id: `deep-${i}`,
        pageId: doc.pages[0].id,
        name: `Deep ${i}`,
        kind: 'frame',
        parentId: i ? `deep-${i - 1}` : 'card',
        fontFamily: 'A Descendant Font',
      }),
    );
  expect(validateDocument(doc).nodes).toHaveLength(5004);
  const notes = exportSupport(doc, 'card', 'tailwind-classes').notes;
  expect(notes.some((n) => n.includes('Descendant Font'))).toBe(false);
  expect(notes.some((n) => n.includes('selected element only'))).toBe(true);
});
