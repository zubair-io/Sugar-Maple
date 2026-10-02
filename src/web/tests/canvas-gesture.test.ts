import { test, expect } from 'bun:test';
import { DocumentStore } from '../src/app/model/store';
import { CanvasSelectionTool } from '../src/app/canvas/canvas-selection-tool';
import { project, flatten } from '../src/app/canvas/scene-layout';
import { uid } from '../src/app/model/schema';
import { angleAt, handlePoint } from '../src/app/canvas/transform-geometry';
import { transform } from '../src/app/canvas/scene-layout';
const state = <T>(initial: T) => {
  let value = initial;
  return Object.assign(() => value, {
    set: (next: T) => {
      value = next;
    },
  });
};
function fixture() {
  const store = new DocumentStore(),
    pageId = store.document.pages[0].id;
  const commit = (operations: any[]) =>
    store.transact({
      documentId: store.document.id,
      expectedRevision: store.revision,
      requestId: uid(),
      operations,
    });
  commit([
    {
      type: 'node.add',
      node: {
        id: 'rect',
        kind: 'rectangle',
        pageId,
        name: 'Rectangle',
        x: 20,
        y: 20,
        width: 100,
        height: 80,
      },
    },
  ]);
  const page = state(pageId),
    toolState = state<any>({});
  const selected = state<string[]>([]),
    draft = state<any>({});
  const e = {
    selection: selected,
    doc: () => store.document,
    revision: () => store.revision,
    pageId: page,
    mode: () => 'Design',
    select: (id: string | null, extend = false) =>
      selected.set(id ? (extend ? [...selected(), id] : [id]) : []),
    selectedRoots: () => store.document.nodes.filter((n) => selected().includes(n.id)),
    perform: commit,
  };
  const items = () =>
    flatten(
      project(
        { ...store.document, nodes: store.document.nodes.map((n) => ({ ...n, ...draft()[n.id] })) },
        pageId,
      ),
    );
  const projection = {
    e,
    draft,
    items,
    byId: () => new Map(items().map((i) => [i.node.id, i])),
    canMove: () => true,
    canResize: () => true,
    canRotate: () => true,
  };
  const tool = new CanvasSelectionTool(projection as any);
  tool.activate({
    camera: () => ({ x: 0, y: 0, zoom: 1 }),
    selectedIds: selected,
    toolState,
  } as any);
  const pointer = (x: number, y: number) =>
    ({ button: 0, shiftKey: false, canvas: { x, y }, screen: { x, y } }) as any;
  return { store, commit, tool, draft, pointer, page, toolState, selected, items };
}
test('one canvas drag is one atomic undo step and pointer cancellation does not commit', () => {
  const f = fixture(),
    revision = f.store.revision;
  f.tool.onPointerDown(f.pointer(40, 40));
  f.tool.onPointerMove(f.pointer(70, 60));
  expect(f.store.revision).toBe(revision);
  f.tool.onPointerUp(f.pointer(70, 60));
  expect(f.store.document.nodes[0].x).toBe(50);
  expect(f.store.revision).toBe(revision + 1);
  f.store.undo();
  expect(f.store.document.nodes[0].x).toBe(20);
  const current = f.store.revision;
  f.tool.onPointerDown(f.pointer(40, 40));
  f.tool.onPointerMove(f.pointer(90, 90));
  f.tool.onPointerCancel();
  expect(f.store.revision).toBe(current);
  expect(f.draft()).toEqual({});
});
test('Shift resize retains selection and commits one undo step; a no-op handle click commits none', () => {
  const f = fixture();
  f.selected.set(['rect']);
  const item = f.items()[0],
    point = handlePoint(item, 'nw', 1),
    revision = f.store.revision;
  f.tool.beginHandle('nw');
  f.tool.onPointerDown({ ...f.pointer(point.x, point.y), shiftKey: true });
  f.tool.onPointerMove({ ...f.pointer(point.x - 40, point.y - 20), shiftKey: true });
  f.tool.onPointerUp({ ...f.pointer(point.x - 40, point.y - 20), shiftKey: true });
  expect(f.selected()).toEqual(['rect']);
  expect(f.store.revision).toBe(revision + 1);
  expect(f.store.document.nodes[0].width / f.store.document.nodes[0].height).toBeCloseTo(1.25, 8);
  f.store.undo();
  expect(f.store.document.nodes[0].x).toBe(20);
  expect(f.store.document.nodes[0].width).toBe(100);
  const current = f.store.revision;
  f.tool.beginHandle('nw');
  f.tool.onPointerDown(f.pointer(point.x, point.y));
  f.tool.onPointerUp(f.pointer(point.x, point.y));
  expect(f.store.revision).toBe(current);
});
test('rotation accumulates across the angle seam and pointer cancellation discards it', () => {
  const f = fixture();
  f.selected.set(['rect']);
  const item = f.items()[0],
    center = transform(item.transform, item.x + item.width / 2, item.y + item.height / 2);
  const at = (degrees: number) =>
    f.pointer(
      center.x + 100 * Math.cos((degrees * Math.PI) / 180),
      center.y + 100 * Math.sin((degrees * Math.PI) / 180),
    );
  const revision = f.store.revision;
  f.tool.beginHandle('rotate');
  f.tool.onPointerDown(at(170));
  f.tool.onPointerMove(at(179));
  f.tool.onPointerMove(at(-179));
  f.tool.onPointerUp(at(-170));
  expect(f.store.document.nodes[0].rotation).toBeCloseTo(20, 8);
  expect(f.store.revision).toBe(revision + 1);
  expect(angleAt(item, at(-170).canvas.x, at(-170).canvas.y)).toBeCloseTo(-170, 8);
  f.tool.beginHandle('rotate');
  f.tool.onPointerDown(at(-170));
  f.tool.onPointerMove(at(-120));
  f.tool.onPointerCancel();
  expect(f.draft()).toEqual({});
  expect(f.store.revision).toBe(revision + 1);
});
test('page switching cancels the gesture and clears its marquee overlay', () => {
  const f = fixture(),
    revision = f.store.revision;
  f.tool.onPointerDown(f.pointer(300, 300));
  f.tool.onPointerMove(f.pointer(350, 350));
  expect(f.toolState().selectionBox).toBeDefined();
  f.page.set('another-page');
  f.tool.onPointerUp(f.pointer(350, 350));
  expect(f.store.revision).toBe(revision);
  expect(f.toolState()).toEqual({});
  expect(f.draft()).toEqual({});
});
test('an agent revision during drag cancels the stale gesture and preserves the agent edit', () => {
  const f = fixture();
  f.tool.onPointerDown(f.pointer(40, 40));
  f.tool.onPointerMove(f.pointer(70, 60));
  f.commit([{ type: 'node.update', id: 'rect', patch: { x: 200 } }]);
  const revision = f.store.revision;
  f.tool.onPointerUp(f.pointer(70, 60));
  expect(f.store.revision).toBe(revision);
  expect(f.store.document.nodes[0].x).toBe(200);
  expect(f.draft()).toEqual({});
});
