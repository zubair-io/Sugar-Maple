import { test, expect } from 'bun:test';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv-provider.js';
import { ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { blankDocument, NodeSchema, type SceneDocument } from '../src/app/model/schema';
import { discoverEditor, readScope } from '../src/app/model/scoped-read';
import { ScopedReadSchema } from '../src/app/model/read-contract';
import { toolArguments, toolError, toolInputJSONSchemas } from '../src/app/model/tool-contract';
import { toolOutputJSONSchemas } from '../src/app/model/tool-output';
function fixture() {
  const doc = blankDocument('Scoped fixture'),
    page = doc.pages[0].id;
  doc.pages.push({ id: 'other', name: 'Other', order: 1, folderId: null });
  doc.tokens = { 'brand.primary': '#c4493a', unrelated: '#ffffff' };
  for (const [id, parentId, order, pageId, componentId] of [
    ['child-b', 'board', 2, page, 'master'],
    ['board', null, 0, page, null],
    ['child-a', 'board', 1, page, null],
    ['master', null, 1, 'other', null],
    ['outside', null, 2, 'other', null],
  ] as const)
    doc.nodes.push(
      NodeSchema.parse({
        id,
        parentId,
        order,
        pageId,
        componentId,
        kind: parentId ? 'button' : 'frame',
        name: id,
        fillToken: id === 'child-b' ? 'brand.primary' : '',
      }),
    );
  return doc;
}
function read(doc: SceneDocument, query: any, selection: string[] = []) {
  return readScope(
    doc,
    7,
    ScopedReadSchema.parse({ documentId: doc.id, expectedRevision: 7, ...query }),
    selection,
  );
}
test('scoped pagination preserves authoritative nodes, ancestor context, token values and component references', () => {
  const doc = fixture(),
    before = JSON.stringify(doc);
  const first = read(doc, { scope: 'subtree', nodeId: 'board', limit: 2 });
  expect(first.nodes.map((n) => n.id)).toEqual(['board', 'child-a']);
  expect(first.nextOffset).toBe(2);
  expect(first.total).toBe(3);
  const last = read(doc, { scope: 'subtree', nodeId: 'board', offset: 2, limit: 2 });
  expect(last.nodes).toEqual([doc.nodes[0]]);
  expect(last.nextOffset).toBe(null);
  expect(last.references.ancestors.map((n) => n.id)).toEqual(['board']);
  expect(last.references.tokens).toEqual({ 'brand.primary': '#c4493a' });
  expect(last.references.components).toEqual([{ id: 'master', pageId: 'other', name: 'master' }]);
  expect(last.references.pages.map((p) => p.id)).toEqual([doc.pages[0].id, 'other']);
  expect(JSON.stringify(doc)).toBe(before);
  expect(read(doc, { scope: 'page', pageId: 'other' }).nodes.map((n) => n.id)).toEqual([
    'master',
    'outside',
  ]);
  const validator = new AjvJsonSchemaValidator(),
    schemas = toolOutputJSONSchemas();
  const inputs = toolInputJSONSchemas();
  expect(
    ListToolsResultSchema.safeParse({
      tools: Object.entries(inputs).map(([name, inputSchema]) => ({
        name,
        inputSchema,
        outputSchema: schemas[name as keyof typeof schemas],
      })),
    }).success,
  ).toBe(true);
  expect(validator.getValidator(schemas['document.read'])(last).valid).toBe(true);
  expect(
    validator.getValidator(schemas['editor.discover'])(
      discoverEditor(doc, 7, doc.pages[0].id, ['child-b']),
    ).valid,
  ).toBe(true);
});
test('selection snapshots deduplicate descendants and stay stable across human selection changes', () => {
  const doc = fixture(),
    first = read(doc, { scope: 'selection', limit: 1 }, ['child-a', 'board', 'board']);
  expect(first.rootIds).toEqual(['board']);
  expect(first.total).toBe(3);
  expect(() => read(doc, { scope: 'selection', offset: 1, limit: 1 }, ['outside'])).toThrow(
    'snapshot',
  );
  const second = read(
    doc,
    { scope: 'selection', selectionIds: first.rootIds, offset: 1, limit: 1 },
    ['outside'],
  );
  expect(second.nodes[0].id).toBe('child-a');
  expect(read(doc, { scope: 'selection' }, []).total).toBe(0);
});
test('stale/wrong targets, unknown scope IDs, oversized limits and invalid crops fail explicitly', () => {
  const doc = fixture();
  for (const [query, code] of [
    [{ scope: 'document', documentId: 'wrong' }, 'wrong_document'],
    [{ scope: 'document', expectedRevision: 8 }, 'stale_revision'],
    [{ scope: 'subtree', nodeId: 'missing' }, 'not_found'],
    [{ scope: 'page', pageId: 'missing' }, 'not_found'],
    [{ scope: 'document', limit: 501 }, 'invalid_input'],
    [{ scope: 'document', offset: 999 }, 'invalid_input'],
  ] as const) {
    try {
      read(doc, query);
      throw Error('Expected failure');
    } catch (error) {
      expect(toolError(error, { documentId: doc.id, revision: 7 }).code).toBe(code);
    }
  }
  for (const extra of [
    { scale: 3 },
    { rect: { x: -1, y: 0, width: 10, height: 10 } },
    { rect: { x: 0, y: 0, width: 0, height: 10 } },
    { rect: { x: 0, y: 0, width: 5000, height: 10 } },
  ])
    expect(() =>
      toolArguments('render.capture', { documentId: doc.id, expectedRevision: 7, ...extra }),
    ).toThrow();
});
test('a 10,000-deep tree is read without recursion and bounded payload failures preserve the scene', () => {
  const doc = blankDocument(),
    pageId = doc.pages[0].id;
  for (let i = 0; i < 10000; i++)
    doc.nodes.push(
      NodeSchema.parse({
        id: `n${i}`,
        pageId,
        kind: 'frame',
        name: 'Deep',
        parentId: i ? `n${i - 1}` : null,
      }),
    );
  expect(read(doc, { scope: 'subtree', nodeId: 'n0', limit: 1 }).total).toBe(10000);
  // An inline image fits alone but a wide image page must use smaller pages.
  const wide = blankDocument(),
    asset = 'data:image/png;base64,' + 'A'.repeat(7_999_900);
  for (let i = 0; i < 3; i++)
    wide.nodes.push(
      NodeSchema.parse({
        id: `image${i}`,
        pageId: wide.pages[0].id,
        kind: 'image',
        name: 'Image',
        asset,
      }),
    );
  expect(() => read(wide, { scope: 'document', limit: 3 })).toThrow('16 MiB');
  expect(read(wide, { scope: 'document', limit: 1 }).nodes.length).toBe(1);
});
