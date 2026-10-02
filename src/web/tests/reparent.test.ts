import { expect, test } from 'bun:test';
import { blankDocument, NodeSchema, type SceneDocument } from '../src/app/model/schema';
import { DocumentStore } from '../src/app/model/store';
import { flatten, project, transform, type Item } from '../src/app/canvas/scene-layout';
import { planReparent, type ReparentRequest } from '../src/app/canvas/reparent-geometry';

const measure = (text: string) => text.length * 13;
function fixture() {
  const doc = blankDocument(), pageId = doc.pages[0].id;
  doc.nodes = [
    { id: 'outer', name: 'Outer', kind: 'frame', x: 100, y: 150, width: 700, height: 600, rotation: 40, strokeWidth: 5 },
    { id: 'old', name: 'Old', kind: 'frame', parentId: 'outer', x: 30, y: 45, width: 300, height: 280, rotation: -65, strokeWidth: 7 },
    { id: 'new', name: 'New', kind: 'frame', x: 460, y: -80, width: 500, height: 450, rotation: -35, strokeWidth: 11 },
    { id: 'a', name: 'A', kind: 'frame', parentId: 'old', x: 60, y: 80, width: 120, height: 75, rotation: 30 },
    { id: 'child', name: 'Child', kind: 'rectangle', parentId: 'a', x: 4, y: 7, widthMode: 'percent', widthPercent: 80, height: 25, rotation: 10 },
    { id: 'b', name: 'B', kind: 'text', parentId: 'old', x: 120, y: 210, width: 200, height: 40, widthMode: 'hug', heightMode: 'hug', text: '世界 café', rotation: -20 },
    { id: 'existing', name: 'Existing', kind: 'rectangle', parentId: 'new', x: 20, y: 30, width: 30, height: 40, order: 900 },
  ].map(node => NodeSchema.parse({ pageId, ...node }));
  return doc;
}
const items = (doc: SceneDocument) => new Map(flatten(project(doc, doc.pages[0].id, measure)).map(item => [item.node.id, item]));
const corners = (item: Item) => [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) =>
  transform(item.transform, item.x + x * item.width, item.y + y * item.height));
function request(doc: SceneDocument, patch: Partial<ReparentRequest> = {}): ReparentRequest {
  return { documentId: doc.id, expectedRevision: 0, ids: ['a', 'b'], parentId: 'new', placement: 'preserve-world', ...patch };
}
function applied(doc: SceneDocument, input: ReparentRequest) {
  const plan = planReparent(doc, input, measure), store = new DocumentStore(doc);
  if (plan.operations.length) store.transact({ documentId: doc.id, expectedRevision: 0, requestId: 'reparent', operations: plan.operations });
  return { plan, store };
}
function sameGeometry(before: SceneDocument, after: SceneDocument, ids: string[]) {
  const a = items(before), b = items(after);
  for (const id of ids) {
    const aa = corners(a.get(id)!), bb = corners(b.get(id)!);
    for (let k = 0; k < 4; k++) {
      expect(bb[k].x).toBeCloseTo(aa[k].x, 7);
      expect(bb[k].y).toBeCloseTo(aa[k].y, 7);
    }
  }
}
test('reparent preserves four world corners and responsive descendants across nested rotations and borders', () => {
  const doc = fixture(), unchanged = structuredClone(doc), { plan, store } = applied(doc, request(doc));
  sameGeometry(doc, store.document, ['a', 'b', 'child']);
  expect(doc).toEqual(unchanged);
  expect(store.document.nodes.find(node => node.id === 'a')!.parentId).toBe('new');
  expect(store.document.nodes.find(node => node.id === 'a')!.order).toBe(901);
  expect(store.document.nodes.find(node => node.id === 'b')!.order).toBe(902);
  expect(store.document.nodes.find(node => node.id === 'existing')!).toEqual(doc.nodes.find(node => node.id === 'existing')!);
  expect(plan.warnings.some(warning => warning.includes('responsive sizing'))).toBe(true);
  expect(store.revision).toBe(1);
  store.undo(); expect(store.document).toEqual(doc);
  store.redo(); sameGeometry(doc, store.document, ['a', 'b', 'child']);
  expect(DocumentStore.fromCheckpoint(store.checkpoint()).document).toEqual(store.document);
});
test('reparent can lift a rotated subtree to page root and return it without world drift', () => {
  const doc = fixture(), lifted = applied(doc, request(doc, { ids: ['a'], parentId: null })).store.document;
  sameGeometry(doc, lifted, ['a', 'child']);
  const returned = applied(lifted, request(lifted, { ids: ['a'], parentId: 'old' })).store.document;
  sameGeometry(doc, returned, ['a', 'child']);
});
test('a selected ancestor owns its subtree and descendant selection does not duplicate its move', () => {
  const doc = fixture(), { plan, store } = applied(doc, request(doc, { ids: ['a', 'child'] }));
  expect(plan.names).toEqual(['A']);
  expect(plan.operations.filter(op => op.type === 'node.update' && op.id === 'child')).toHaveLength(0);
  sameGeometry(doc, store.document, ['a', 'child']);
});
test('destination flow rejects preserve-world and accepts explicit local layout rules', () => {
  const doc = fixture(); doc.nodes.find(node => node.id === 'new')!.layout = 'vertical';
  expect(() => planReparent(doc, request(doc), measure)).toThrow('controls child positions');
  const { plan, store } = applied(doc, request(doc, { placement: 'layout' }));
  const b = store.document.nodes.find(node => node.id === 'b')!;
  expect(b.widthMode).toBe('hug'); expect(b.heightMode).toBe('hug');
  expect(b.x).toBe(120); expect(b.y).toBe(210);
  expect(plan.warnings[0]).toContain('determine the new placement');
  expect(items(store.document).get('b')!.y).not.toBe(items(doc).get('b')!.y);
  store.undo(); expect(store.document).toEqual(doc);
});
test('moving a child out of managed layout preserves its actual rendered size and world placement', () => {
  const doc = fixture(); doc.nodes.find(node => node.id === 'old')!.layout = 'horizontal';
  doc.nodes.find(node => node.id === 'a')!.widthMode = 'fill';
  const { store } = applied(doc, request(doc));
  sameGeometry(doc, store.document, ['a', 'b', 'child']);
});
test('same-parent move is an exact no-op before flow checks or responsive freezing', () => {
  const doc = fixture(); doc.nodes.find(node => node.id === 'old')!.layout = 'horizontal';
  const { plan, store } = applied(doc, request(doc, { parentId: 'old' }));
  expect(plan.operations).toEqual([]); expect(plan.warnings).toEqual([]);
  expect(store.revision).toBe(0); expect(store.document).toEqual(doc);
});
test('cycles, duplicate selections, missing targets, cross-page moves and hidden/locked ancestors fail without mutation', () => {
  const doc = fixture(), before = structuredClone(doc);
  for (const patch of [{ ids: ['a'], parentId: 'a' }, { ids: ['old'], parentId: 'a' },
      { ids: ['a', 'a'] }, { ids: ['missing'] }, { parentId: 'missing' }, { parentId: 'b' }])
    expect(() => planReparent(doc, request(doc, patch), measure)).toThrow();
  expect(doc).toEqual(before);
  const second = { id: 'page2', name: 'Second', order: 1, folderId: null };
  doc.pages.push(second); doc.nodes.find(node => node.id === 'new')!.pageId = second.id;
  expect(() => planReparent(doc, request(doc), measure)).toThrow('same page');
  for (const key of ['hidden', 'locked'] as const) {
    const blocked = structuredClone(before); blocked.nodes.find(node => node.id === 'outer')![key] = true;
    expect(() => planReparent(blocked, request(blocked), measure)).toThrow('Unlock and show');
    blocked.nodes.find(node => node.id === 'outer')![key] = false;
    blocked.nodes.find(node => node.id === 'new')![key] = true;
    expect(() => planReparent(blocked, request(blocked), measure)).toThrow('Unlock and show');
  }
});
test('authored coordinate overflow rejects an entire multi-root move', () => {
  const doc = fixture();
  doc.nodes.find(node => node.id === 'new')!.x = -100000;
  doc.nodes.find(node => node.id === 'new')!.rotation = 0;
  doc.nodes.find(node => node.id === 'outer')!.x = 100000;
  const before = structuredClone(doc);
  expect(() => planReparent(doc, request(doc), measure)).toThrow();
  expect(doc).toEqual(before);
});
test('sibling order at the coordinate limit is normalized without changing visual ordering', () => {
  const doc = fixture(); doc.nodes.find(node => node.id === 'existing')!.order = 100000;
  doc.nodes.push(NodeSchema.parse({ ...doc.nodes.find(node => node.id === 'existing')!, id: 'earlier-alphabetically', name: 'Second tied sibling' }));
  const { store } = applied(doc, request(doc));
  expect(store.document.nodes.filter(node => node.parentId === 'new').sort((a, b) => a.order - b.order).map(node => node.id))
    .toEqual(['existing', 'earlier-alphabetically', 'a', 'b']);
  sameGeometry(doc, store.document, ['a', 'b', 'child']);
});
test('current font measurement determines hug size rather than an approximate character metric', () => {
  const doc = fixture(), r = request(doc, { ids: ['b'] }), custom = (text: string) => text.length * 41;
  const before = new Map(flatten(project(doc, doc.pages[0].id, custom)).map(item => [item.node.id, item]));
  const plan = planReparent(doc, r, custom), b = plan.operations.find(op => op.type === 'node.update' && op.id === 'b');
  expect(b?.type === 'node.update' && b.patch.width).toBe(before.get('b')!.width);
});
test('selection plus required order normalization respects the existing atomic transaction bound', () => {
  const doc = fixture(); doc.nodes.find(node => node.id === 'existing')!.order = 100000;
  const template = doc.nodes.find(node => node.id === 'a')!;
  const ids = Array.from({ length: 500 }, (_, index) => 'large-' + index);
  doc.nodes.push(...ids.map(id => ({ ...template, id, name: id })));
  const before = structuredClone(doc);
  expect(() => planReparent(doc, request(doc, { ids }), measure)).toThrow('500-update atomic');
  expect(doc).toEqual(before);
});
