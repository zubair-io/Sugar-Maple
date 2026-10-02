import { test, expect } from 'bun:test';
import { blankDocument, NodeSchema } from '../src/app/model/schema';
import { flatten, project } from '../src/app/canvas/scene-layout';
import {
  alignment,
  boxIn,
  distribution,
  resizeDirection,
  resizePoint,
  snapIndex,
  snapMove,
  snapPoint,
  type Edge,
} from '../src/app/canvas/placement-geometry';
import { handlePoint, resizePatch, type ResizeHandle } from '../src/app/canvas/transform-geometry';
function fixture() {
  const doc = blankDocument(),
    pageId = doc.pages[0].id;
  doc.nodes = [
    NodeSchema.parse({
      id: 'parent',
      name: 'Parent',
      pageId,
      kind: 'frame',
      x: 100,
      y: 100,
      width: 800,
      height: 600,
      strokeWidth: 3,
      rotation: 35,
    }),
    ...[0, 1, 2, 3].map((k) =>
      NodeSchema.parse({
        id: 'node-' + k,
        name: 'Node ' + k,
        pageId,
        parentId: k === 3 ? null : 'parent',
        kind: 'rectangle',
        x: 90 + k * 180,
        y: 100 + k * 80,
        width: 60 + k * 20,
        height: 35 + k * 10,
        rotation: 20 - k * 30,
      }),
    ),
  ];
  const items = () => flatten(project(doc, pageId)),
    selected = () => items().filter((i) => i.node.id !== 'parent');
  const apply = (patches: ReturnType<typeof alignment>) => {
    expect(patches).not.toBeNull();
    for (const p of patches!)
      Object.assign(
        doc.nodes.find((n) => n.id === p.id)!,
        p.patch,
      );
  };
  return { doc, items, selected, apply };
}
for (const edge of ['left', 'center', 'right', 'top', 'middle', 'bottom'] as Edge[])
  test('align ' + edge + ' uses rendered bounds across different rotated parents', () => {
    const f = fixture(),
      before = f.selected(),
      horizontal = ['left', 'center', 'right'].includes(edge),
      axis = horizontal ? 'x' : 'y',
      size = horizontal ? 'width' : 'height',
      factor =
        edge === 'left' || edge === 'top' ? 0 : edge === 'right' || edge === 'bottom' ? 1 : 0.5;
    f.apply(alignment(before, edge));
    const after = f.selected(),
      values = after.map((i) => i.bounds[axis] + i.bounds[size] * factor);
    for (const value of values) expect(value).toBeCloseTo(values[0], 7);
    expect(after.map((i) => i.node.rotation)).toEqual(before.map((i) => i.node.rotation));
    expect(alignment(after, edge)).toEqual([]);
  });
test('one rotated child aligns inside its rotated parent coordinate frame, preserving border offset', () => {
  for (const edge of ['left', 'center', 'right', 'top', 'middle', 'bottom'] as Edge[]) {
    const f = fixture(),
      child = f.selected()[0],
      parent = f.items()[0],
      horizontal = ['left', 'center', 'right'].includes(edge),
      axis = horizontal ? 'x' : 'y',
      size = horizontal ? 'width' : 'height',
      factor =
        edge === 'left' || edge === 'top' ? 0 : edge === 'right' || edge === 'bottom' ? 1 : 0.5;
    f.apply(alignment([child], edge));
    const b = boxIn(f.selected()[0], parent.transform);
    expect(b[axis] + factor * b[size]).toBeCloseTo(
      parent[axis] +
        parent.node.strokeWidth +
        factor * (parent[size] - 2 * parent.node.strokeWidth),
      7,
    );
  }
});
for (const axis of ['x', 'y'] as const)
  test(
    'equal ' + axis + ' gaps pin endpoints through rotations and preserve heterogeneous sizes',
    () => {
      const f = fixture(),
        size = axis === 'x' ? 'width' : 'height',
        before = [...f.selected()].sort((a, b) => a.bounds[axis] - b.bounds[axis]);
      const first = before[0].bounds[axis],
        last = before.at(-1)!.bounds[axis],
        ids = before.map((i) => i.node.id);
      f.apply(distribution(before, axis));
      const after = ids.map((id) => f.selected().find((i) => i.node.id === id)!);
      expect(after[0].bounds[axis]).toBeCloseTo(first, 7);
      expect(after.at(-1)!.bounds[axis]).toBeCloseTo(last, 7);
      const gaps = after
        .slice(1)
        .map((i, k) => i.bounds[axis] - after[k].bounds[axis] - after[k].bounds[size]);
      for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0], 7);
      expect(after.map((i) => [i.width, i.height, i.node.rotation])).toEqual(
        before.map((i) => [i.width, i.height, i.node.rotation]),
      );
      expect(distribution(after, axis)).toEqual([]);
    },
  );
test('unrepresentable alignment is atomic instead of clamping individual members', () => {
  const f = fixture();
  f.doc.nodes[1].x = 100000;
  f.doc.nodes[1].rotation = 0;
  f.doc.nodes[2].x = -100000;
  f.doc.nodes[2].rotation = 0;
  // Very different parent transforms make a requested world move exceed an authored-axis limit.
  f.doc.nodes[0].rotation = 45;
  f.doc.nodes[1].y = 100000;
  f.doc.nodes[2].y = -100000;
  const snapshot = structuredClone(f.doc);
  expect(alignment(f.selected(), 'left')).toBeNull();
  expect(f.doc).toEqual(snapshot);
});
test('nearest snapping uses a fixed CSS-pixel threshold, deterministic targets and a uniform selection delta', () => {
  const f = fixture(),
    target = f.selected()[0],
    index = snapIndex([target]),
    moving = { x: target.bounds.x - 107, y: target.bounds.y - 150, width: 100, height: 40 };
  for (const zoom of [0.5, 1.5]) {
    const snap = snapMove(index, moving, 7 - 4 / zoom, 70, 6 / zoom);
    expect(snap.delta.x).toBeCloseTo(4 / zoom, 7);
    expect(snap.guides.some((g) => g.axis === 'x' && g.value === target.bounds.x)).toBe(true);
    expect(snapMove(index, moving, 7 - 7 / zoom, 70, 6 / zoom).delta.x).toBe(0);
  }
  const reversed = snapIndex([target, ...f.selected().slice(1)]),
    normal = snapIndex([...f.selected().slice(1), target]);
  expect(snapPoint(reversed, { x: target.bounds.x + 2, y: target.bounds.y + 3 }, 6)).toEqual(
    snapPoint(normal, { x: target.bounds.x + 2, y: target.bounds.y + 3 }, 6),
  );
});
test('rotated side/proportional resize snapping keeps the opposite anchor and reaches its guide', () => {
  for (const handle of ['n', 'w', 'se'] as ResizeHandle[])
    for (const proportional of [false, true]) {
      const f = fixture(),
        item = f.selected()[0],
        initial = resizePatch(item, handle, 23, 17, proportional),
        point = resizePoint(item, handle, initial);
      const direction = resizeDirection(item, handle, proportional),
        vector = direction
          ? {
              x: direction.x / Math.hypot(direction.x, direction.y),
              y: direction.y / Math.hypot(direction.x, direction.y),
            }
          : { x: 1, y: 0 };
      const target = {
        ...item,
        bounds: { x: point.x + vector.x * 3, y: point.y + vector.y * 3, width: 20, height: 15 },
      };
      const snapped = snapPoint(snapIndex([target]), point, 6, direction);
      const final = resizePatch(
          item,
          handle,
          23 + snapped.delta.x,
          17 + snapped.delta.y,
          proportional,
        ),
        actual = resizePoint(item, handle, final);
      expect(snapped.guides.length).toBeGreaterThan(0);
      for (const guide of snapped.guides) expect(actual[guide.axis]).toBeCloseTo(guide.value, 7);
      Object.assign(
        f.doc.nodes.find((n) => n.id === item.node.id)!,
        final,
      );
      const after = f.selected()[0],
        opposite = { n: 's', w: 'e', se: 'nw' }[handle] as ResizeHandle;
      const a = handlePoint(item, opposite, 1),
        b = handlePoint(after, opposite, 1);
      expect(b.x).toBeCloseTo(a.x, 7);
      expect(b.y).toBeCloseTo(a.y, 7);
    }
});
