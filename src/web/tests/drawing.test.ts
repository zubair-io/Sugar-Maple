import { expect, test } from 'bun:test';
import { CanvasDrawingTool } from '../src/app/canvas/canvas-drawing-tool';
import { drawingGeometry, constrainedPoint, MAX_DRAWING_POINTS, type DrawingKind } from '../src/app/canvas/drawing-geometry';
import { blankDocument, NodeSchema, type Operation } from '../src/app/model/schema';
import { assertHumanEdits } from '../src/app/model/edit-locks';
import { DocumentStore } from '../src/app/model/store';
import { flatten, project } from '../src/app/canvas/scene-layout';
import type { CanvasPointerEvent } from '../src/app/canvas/whiteboard/core/models/types';
const signal = <T>(initial: T) => { let value = initial; const read = () => value; read.set = (next: T) => { value = next; }; return read; };
function fixture(kind: DrawingKind, parent = true) {
  const doc = blankDocument(), pageId = doc.pages[0].id;
  if (parent) doc.nodes = [NodeSchema.parse({ id: 'frame', kind: 'frame', name: 'Frame', pageId,
    x: 40, y: 60, width: 500, height: 400, rotation: 30, strokeWidth: 6 })];
  const store = new DocumentStore(doc), selection = signal(parent ? ['frame'] : [] as string[]), errors: string[] = [];
  const e = { doc: () => store.document, revision: () => store.revision, mode: signal('Design'), pageId: signal(pageId), selection,
    insertionParent: () => parent ? 'frame' : null, select: (id: string) => selection.set([id]),
    report: (error: unknown) => errors.push(String(error)), error: { set: (message: string) => errors.push(message) },
    perform: (operations: Operation[]) => { assertHumanEdits(store.document, operations); return store.transact({
      documentId: store.document.id, expectedRevision: store.revision, requestId: crypto.randomUUID(), operations }, 'human'); },
  };
  const p = { e, drawingTool: signal<DrawingKind | null>(kind), draftNodes: signal<any[]>([]), drawingPending: signal(false),
    drawingWidth: signal(4), drawingColor: signal('#111827'),
    byId: () => new Map(flatten(project(store.document, pageId)).map(item => [item.node.id, item])),
    canEdit: (node: any) => !node.locked && !node.hidden };
  const tool = new CanvasDrawingTool(p as any);
  tool.activate({ camera: () => ({ zoom: 1, x: 0, y: 0 }), selectedIds: signal<string[]>([]), requestRender() {} } as any);
  const event = (x: number, y: number, shiftKey = false): CanvasPointerEvent => ({ canvas: { x, y }, screen: { x, y },
    pressure: 0.5, button: 0, shiftKey, ctrlKey: false, metaKey: false, altKey: false, isPan: false, pointerType: 'mouse' });
  return { p, e, store, errors, tool, event };
}
function coordinates(path: string) { return (path.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number); }
test('portable line bounds include the stroke and preserve endpoints in all drag directions', () => {
  for (const end of [{ x: 150, y: 80 }, { x: -50, y: 20 }, { x: 50, y: -80 }, { x: 50, y: 20 }]) {
    const start = { x: 10, y: 20 }, geometry = drawingGeometry('line', [start, end], 4, '#111827')!;
    const values = coordinates(geometry.pathData);
    expect(values[0] + geometry.x).toBeCloseTo(start.x, 4); expect(values[1] + geometry.y).toBeCloseTo(start.y, 4);
    expect(values[2] + geometry.x).toBeCloseTo(end.x, 4); expect(values[3] + geometry.y).toBeCloseTo(end.y, 4);
    expect(geometry.width).toBeGreaterThan(0); expect(geometry.height).toBeGreaterThan(0);
    expect(geometry.fillEnabled).toBe(false); expect(geometry.strokeWidth).toBe(4);
    expect(() => NodeSchema.parse({ id: 'line', name: 'Line', pageId: 'page', kind: 'path', ...geometry })).not.toThrow();
  }
  expect(drawingGeometry('line', [{ x: 0, y: 0 }, { x: 0, y: 0 }], 4, '#111827')).toBeNull();
});
test('arrow head meets the endpoint, fits its persisted box and scales down for short arrows', () => {
  for (const end of [{ x: 100, y: 0 }, { x: -100, y: 40 }, { x: 0, y: -100 }, { x: 1, y: 1 }]) {
    const geometry = drawingGeometry('arrow', [{ x: 0, y: 0 }, end], 4, '#111827')!, values = coordinates(geometry.pathData);
    expect(values[2]).toBe(values[6]); expect(values[3]).toBe(values[7]);
    values.forEach((value, index) => { expect(value).toBeGreaterThanOrEqual(0); expect(value).toBeLessThanOrEqual(index % 2 ? geometry.height : geometry.width); });
  }
});
test('freehand reuses pressure geometry as a closed, finite portable outline including single-point dots', () => {
  const points = [{ x: 0, y: 0 }, { x: 20, y: 20 }, { x: 60, y: 0 }];
  const thin = drawingGeometry('freehand', points.map(point => ({ ...point, pressure: 0.1 })), 16, '#2563eb')!;
  const thick = drawingGeometry('freehand', points.map(point => ({ ...point, pressure: 0.9 })), 16, '#2563eb')!;
  expect(thick.height).toBeGreaterThan(thin.height); expect(thick.pathData).toEndWith(' Z');
  expect(thick.fillEnabled).toBe(true); expect(thick.strokeWidth).toBe(0);
  expect(drawingGeometry('freehand', [{ x: 10, y: 10 }], 4, '#111827')!.width).toBeGreaterThan(1);
  expect(() => NodeSchema.parse({ id: 'ink', name: 'Ink', pageId: 'page', kind: 'path', ...thick })).not.toThrow();
});
test('Shift angle constraint and closed/open paths preserve deterministic authored geometry', () => {
  const end = constrainedPoint({ x: 10, y: 20 }, { x: 50, y: 48 });
  expect(end.x - 10).toBeCloseTo(end.y - 20, 6);
  expect(Math.hypot(end.x - 10, end.y - 20)).toBeCloseTo(Math.hypot(40, 28), 6);
  const points = [{ x: 10, y: 20 }, { x: 50, y: 30 }, { x: 30, y: 60 }];
  expect(drawingGeometry('path', points, 4, '#111827', true, true)!.pathData).toEndWith(' Z');
  expect(drawingGeometry('path', points, 4, '#111827')!.pathData).not.toEndWith(' Z');
});
test('invalid/oversized geometry rejects explicitly without non-finite or over-limit node data', () => {
  const start = { x: 0, y: 0 };
  for (const bad of [{ x: NaN, y: 0 }, { x: Infinity, y: 0 }, { x: 100001, y: 0 }, { x: 1, y: 1, pressure: 2 }])
    expect(() => drawingGeometry('line', [start, bad], 4, '#111827')).toThrow('limits');
  expect(() => drawingGeometry('line', [{ x: -90000, y: 0 }, { x: 90000, y: 0 }], 4, '#111827')).toThrow('bounds');
  expect(() => drawingGeometry('path', Array(MAX_DRAWING_POINTS + 1).fill(start), 4, '#111827')).toThrow('points');
  expect(() => drawingGeometry('line', [start, { x: 2, y: 3 }], 65, '#111827')).toThrow('width');
});
test('nested rotated-parent drawing previews without authoring and commits one human transaction with exact undo', () => {
  const f = fixture('line'), before = f.store.document, parent = before.nodes[0];
  const world = (x: number, y: number) => {
    const px = parent.x + parent.strokeWidth + x, py = parent.y + parent.strokeWidth + y;
    const cx = parent.x + parent.width / 2, cy = parent.y + parent.height / 2, r = Math.PI / 6;
    return { x: cx + Math.cos(r) * (px - cx) - Math.sin(r) * (py - cy), y: cy + Math.sin(r) * (px - cx) + Math.cos(r) * (py - cy) };
  };
  const start = world(100, 120), end = world(200, 180);
  f.tool.onPointerDown(f.event(start.x, start.y)); f.tool.onPointerMove(f.event(end.x, end.y));
  expect(f.store.revision).toBe(0); expect(f.p.draftNodes().length).toBe(1);
  f.tool.onPointerUp(f.event(end.x, end.y));
  const node = f.store.document.nodes.find(node => node.id !== 'frame')!, values = coordinates(node.pathData);
  expect(node.parentId).toBe('frame'); expect(values[0] + node.x).toBeCloseTo(100, 4); expect(values[1] + node.y).toBeCloseTo(120, 4);
  expect(values[2] + node.x).toBeCloseTo(200, 4); expect(values[3] + node.y).toBeCloseTo(180, 4);
  expect(f.store.revision).toBe(1); expect(f.store.checkpoint().journal.at(-1)!.origin).toBe('human');
  expect(f.p.draftNodes()).toEqual([]); expect(f.p.drawingPending()).toBe(false); expect(f.errors).toEqual([]);
  f.store.undo(); expect(f.store.document).toEqual(before);
});
test('cancel, concurrent edits, changed selection, locked/hidden parents and managed/hug layouts never author a draft', () => {
  for (const action of ['cancel', 'revision', 'selection', 'locked', 'hidden', 'layout', 'hug']) {
    const f = fixture('arrow'), before = f.store.checkpoint();
    if (['locked', 'hidden', 'layout', 'hug'].includes(action)) {
      const patch = action === 'layout' ? { layout: 'vertical' } : action === 'hug' ? { widthMode: 'hug' } : { [action]: true };
      f.e.perform([{ type: 'node.update', id: 'frame', patch } as Operation]);
    }
    const revision = f.store.revision;
    f.tool.onPointerDown(f.event(150, 160)); f.tool.onPointerMove(f.event(200, 220));
    if (action === 'cancel') f.tool.onPointerCancel();
    if (action === 'selection') f.e.selection.set([]);
    if (action === 'revision') f.e.perform([{ type: 'document.rename', name: 'Concurrent edit' }]);
    f.tool.onPointerUp(f.event(200, 220));
    expect(f.store.document.nodes.length).toBe(before.document.nodes.length);
    expect(f.store.revision).toBe(revision + (action === 'revision' ? 1 : 0));
    expect(f.p.draftNodes()).toEqual([]); expect(f.p.drawingPending()).toBe(false);
  }
});
test('polyline points, Backspace and closed Enter finish stay ephemeral until one command', () => {
  const f = fixture('path', false), before = f.store.document;
  for (const [x, y] of [[10, 20], [50, 20], [70, 60]]) { f.tool.onPointerDown(f.event(x, y)); f.tool.onPointerUp(f.event(x, y)); }
  expect(f.store.revision).toBe(0);
  const key = (key: string, shiftKey = false) => ({ key, shiftKey, metaKey: false, ctrlKey: false, altKey: false,
    preventDefault() {}, stopImmediatePropagation() {} }) as KeyboardEvent;
  f.tool.onKeyDown(key('Backspace')); expect(f.store.revision).toBe(0);
  f.tool.onKeyDown(key('Enter', true));
  expect(f.store.revision).toBe(1); expect(f.store.document.nodes[0].pathData).toEndWith(' Z');
  expect(f.p.drawingTool()).toBeNull(); f.store.undo(); expect(f.store.document).toEqual(before);
});
