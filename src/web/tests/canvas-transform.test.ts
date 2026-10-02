import { test, expect } from 'bun:test';
import { blankDocument, NodeSchema } from '../src/app/model/schema';
import { flatten, project, transform, hit } from '../src/app/canvas/scene-layout';
import {
  angleDelta,
  changedPatch,
  editableItem,
  handlePoint,
  movePatch,
  resizeDirections,
  resizePatch,
  rotationPatch,
  type ResizeHandle,
} from '../src/app/canvas/transform-geometry';

function fixture(parentRotation: number, rotation: number) {
  const doc = blankDocument(),
    pageId = doc.pages[0].id;
  doc.nodes = [
    NodeSchema.parse({
      id: 'outer',
      name: 'Outer',
      pageId,
      kind: 'frame',
      x: 130,
      y: 90,
      width: 900,
      height: 700,
      rotation: -17,
      strokeWidth: 3,
    }),
    NodeSchema.parse({
      id: 'parent',
      name: 'Parent',
      pageId,
      parentId: 'outer',
      kind: 'frame',
      x: 120,
      y: 100,
      width: 500,
      height: 450,
      rotation: parentRotation,
      strokeWidth: 2,
    }),
    NodeSchema.parse({
      id: 'child',
      name: 'Child',
      pageId,
      parentId: 'parent',
      kind: 'rectangle',
      x: 120,
      y: 100,
      width: 160,
      height: 90,
      rotation,
    }),
  ];
  const item = () => flatten(project(doc, pageId)).find((i) => i.node.id === 'child')!;
  return { doc, item };
}
for (const handle of Object.keys(resizeDirections) as ResizeHandle[]) {
  test(`${handle} resize pins the opposite world anchor through nested rotations, clamps and aspect lock`, () => {
    for (const parentRotation of [0, 45, -90])
      for (const rotation of [0, 30, 90])
        for (const proportional of [false, true]) {
          for (const delta of [
            { x: 43, y: -27 },
            { x: -12000, y: 12000 },
          ]) {
            const f = fixture(parentRotation, rotation),
              before = f.item();
            const [nx, ny] = resizeDirections[handle];
            const anchor = transform(
              before.transform,
              before.x + ((1 - nx) * before.width) / 2,
              before.y + ((1 - ny) * before.height) / 2,
            );
            const patch = resizePatch(before, handle, delta.x, delta.y, proportional);
            Object.assign(f.doc.nodes[2], patch);
            const after = f.item();
            const pinned = transform(
              after.transform,
              after.x + ((1 - nx) * after.width) / 2,
              after.y + ((1 - ny) * after.height) / 2,
            );
            expect(pinned.x).toBeCloseTo(anchor.x, 7);
            expect(pinned.y).toBeCloseTo(anchor.y, 7);
            expect(
              after.width >= 1 &&
                after.width <= 10000 &&
                after.height >= 1 &&
                after.height <= 10000,
            ).toBe(true);
            if (proportional)
              expect(after.width / after.height).toBeCloseTo(before.width / before.height, 7);
          }
        }
  });
}
test('movement converts world deltas into rotated parent coordinates', () => {
  for (const parentRotation of [0, 30, 90, -45]) {
    const f = fixture(parentRotation, 32),
      before = f.item();
    const center = transform(
      before.transform,
      before.x + before.width / 2,
      before.y + before.height / 2,
    );
    Object.assign(f.doc.nodes[2], movePatch(before, 37, -19));
    const after = f.item(),
      moved = transform(after.transform, after.x + after.width / 2, after.y + after.height / 2);
    expect(moved.x - center.x).toBeCloseTo(37, 8);
    expect(moved.y - center.y).toBeCloseTo(-19, 8);
  }
});
test('rotation holds the world center, crosses the angle seam and snaps to 15 degrees', () => {
  const f = fixture(45, 350),
    before = f.item();
  const center = transform(
    before.transform,
    before.x + before.width / 2,
    before.y + before.height / 2,
  );
  expect(angleDelta(179, -179)).toBe(2);
  expect(angleDelta(-179, 179)).toBe(-2);
  Object.assign(f.doc.nodes[2], rotationPatch(before, 32, true));
  expect(f.doc.nodes[2].rotation).toBe(375);
  const after = f.item(),
    rotated = transform(after.transform, after.x + after.width / 2, after.y + after.height / 2);
  expect(rotated.x).toBeCloseTo(center.x, 8);
  expect(rotated.y).toBeCloseTo(center.y, 8);
});
test('rotation grip stays 28 CSS pixels from the transformed top edge at every zoom', () => {
  const item = fixture(45, 30).item();
  for (const zoom of [0.25, 1, 2]) {
    const top = handlePoint(item, 'n', zoom),
      rotate = handlePoint(item, 'rotate', zoom);
    expect(Math.hypot(top.x - rotate.x, top.y - rotate.y) * zoom).toBeCloseTo(28, 8);
  }
});
test('locked ancestors block hit testing and editing without removing rendered geometry', () => {
  const f = fixture(45, 30);
  f.doc.nodes[0].locked = true;
  const item = f.item(),
    center = transform(item.transform, item.x + item.width / 2, item.y + item.height / 2);
  expect(editableItem(item)).toBe(false);
  expect(hit(flatten(project(f.doc, f.doc.pages[0].id)), center.x, center.y)).toBeUndefined();
  expect(item.node.id).toBe('child');
  f.doc.nodes[0].hidden = true;
  expect(flatten(project(f.doc, f.doc.pages[0].id))).toHaveLength(0);
});
test('clamped and unchanged transforms produce no history patch; invalid placement preserves anchor', () => {
  const f = fixture(0, 0),
    item = f.item();
  expect(changedPatch(item.node, resizePatch(item, 'se', 0, 0))).toEqual({});
  item.node.x = 100000;
  expect(resizePatch(item, 'w', 1000000, 0)).toEqual({});
  expect(changedPatch(item.node, { x: NaN, width: Infinity })).toEqual({});
});
