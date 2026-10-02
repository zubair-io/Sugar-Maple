import { test, expect } from 'bun:test';
import { blankDocument, NodeSchema } from '../src/app/model/schema';
import { exportNode } from '../src/app/model/export';

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
      kind: 'text',
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
