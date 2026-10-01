import { test, expect } from 'bun:test';
import { blankDocument, NodeSchema } from '../src/app/model/schema';
import { project, flatten, hit, transform, wrapText } from '../src/app/canvas/scene-layout';
const scene = () => {
  const doc = blankDocument(),
    pageId = doc.pages[0].id;
  doc.nodes = [
    NodeSchema.parse({
      id: 'board',
      pageId,
      kind: 'artboard',
      name: 'Board',
      width: 500,
      height: 300,
      layout: 'horizontal',
      padding: 20,
      gap: 10,
    }),
    NodeSchema.parse({
      id: 'fixed',
      pageId,
      parentId: 'board',
      kind: 'button',
      name: 'Fixed',
      width: 100,
      height: 40,
    }),
    NodeSchema.parse({
      id: 'fill',
      pageId,
      parentId: 'board',
      kind: 'button',
      name: 'Fill',
      widthMode: 'fill',
      height: 40,
      order: 1,
    }),
  ];
  return doc;
};
test('canvas fixed/fill stacks preserve padding, gaps and order', () => {
  const d = scene(),
    items = flatten(project(d, d.pages[0].id));
  expect(items[1].x).toBe(20);
  expect(items[2].x).toBe(130);
  expect(items[2].width).toBe(350);
});
test('nested rotations share transformed geometry and hit testing with ancestor clipping', () => {
  const d = scene();
  d.nodes[0].layout = 'free';
  d.nodes[0].rotation = 30;
  d.nodes[1].rotation = 45;
  d.nodes[1].x = 30;
  d.nodes[1].y = 30;
  d.nodes[2].hidden = true;
  const items = flatten(project(d, d.pages[0].id)),
    n = items[1],
    center = transform(n.transform, n.x + n.width / 2, n.y + n.height / 2);
  expect(hit(items, center.x, center.y)?.node.id).toBe('fixed');
  d.nodes[1].x = 600;
  const outside = flatten(project(d, d.pages[0].id))[1],
    point = transform(outside.transform, outside.x + 50, outside.y + 20);
  expect(hit(flatten(project(d, d.pages[0].id)), point.x, point.y)).toBeUndefined();
});
test('grid percentage width resolves against its track and rows retain fixed child height', () => {
  const d = scene();
  d.nodes[0].layout = 'grid';
  d.nodes[1].widthMode = 'percent';
  d.nodes[1].widthPercent = 50;
  const i = flatten(project(d, d.pages[0].id));
  expect(i[1].width).toBe(112.5);
  expect(i[2].width).toBe(225);
});
test('text wrapping preserves explicit blank lines and repeated spaces', () => {
  expect(wrapText('A  B\n\nC', 100, (t) => t.length)).toEqual(['A  B', '', 'C']);
});
