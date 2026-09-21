import { test, expect } from 'bun:test';
import { importTokens, exportTokens } from '../src/app/model/tokens';
import { DocumentStore } from '../src/app/model/store';
import { uid } from '../src/app/model/schema';
import { exportNode } from '../src/app/model/export';
test('DTCG opaque sRGB values and aliases import; cycles and unsupported types reject', () => {
  expect(
    importTokens({
      brand: { $type: 'color', $value: { colorSpace: 'srgb', components: [1, 0, 0] } },
      alias: { $value: '{brand}' },
    }),
  ).toEqual([
    { type: 'token.set', name: 'brand', value: '#ff0000' },
    { type: 'token.set', name: 'alias', value: '#ff0000' },
  ]);
  expect(() => importTokens({ a: { $value: '{b}' }, b: { $value: '{a}' } })).toThrow('cycle');
  expect(() => importTokens({ spacing: { $type: 'dimension', $value: 4 } })).toThrow('Only color');
});
test('portable output escapes authored markup and preserves color token binding', () => {
  const s = new DocumentStore(),
    pageId = s.document.pages[0].id;
  const r = s.transact({
    documentId: s.document.id,
    expectedRevision: 0,
    requestId: uid(),
    operations: [
      { type: 'token.set', name: 'color.brand', value: '#123456' },
      {
        type: 'node.add',
        node: { kind: 'text', pageId, text: '<script>alert(1)</script>', fillToken: 'color.brand' },
      },
    ],
  });
  const html = exportNode(s.document, r.ids[0], 'html');
  expect(html).toContain('&lt;script&gt;');
  expect(html).toContain('var(--color-brand)');
  const tokens = JSON.parse(exportTokens(s.document));
  expect(tokens['color.brand'].$value.colorSpace).toBe('srgb');
  expect(exportNode(s.document, r.ids[0], 'svg')).toContain('&lt;script&gt;');
});
