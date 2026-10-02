import type { CanvasProjection } from './canvas-projection';
import type { Tool, ToolContext } from './whiteboard/core/tools/tool.interface';
import type { CanvasPointerEvent } from './whiteboard/core/models/types';
import { NodeSchema, uid, type SceneNode } from '../model/schema';
import { inverse, type Item } from './scene-layout';
import { constrainedPoint, drawingGeometry, MAX_DRAWING_POINTS, type DrawingKind, type DrawingPoint } from './drawing-geometry';

export class CanvasDrawingTool implements Tool {
  get name() { const kind = this.p.drawingTool(); return kind === 'line' || kind === 'arrow' ? kind : 'pen' as const; }
  readonly cursor = 'crosshair';
  private context: ToolContext | null = null;
  private gesture: { kind: DrawingKind; id: string; documentId: string; pageId: string; revision: number;
    selection: string; parent: Item | null; points: DrawingPoint[]; hover: DrawingPoint | null; down: boolean; size: number; color: string } | null = null;
  constructor(private p: CanvasProjection) {}
  activate(context: ToolContext) { this.context = context; }
  deactivate() { this.gesture = null; this.p.draftNodes.set([]); this.p.drawingPending.set(false); }
  cancelIfStale(): boolean {
    if (this.current()) return true;
    this.deactivate(); return false;
  }
  private current() {
    const g = this.gesture, e = this.p.e;
    return !!g && e.doc().id === g.documentId && e.pageId() === g.pageId && e.revision() === g.revision &&
      e.mode() === 'Design' && this.p.drawingTool() === g.kind && JSON.stringify(e.selection()) === g.selection;
  }
  private point(event: CanvasPointerEvent): DrawingPoint {
    const g = this.gesture!, parent = g.parent;
    const point = parent ? inverse(parent.transform, event.canvas.x, event.canvas.y) : event.canvas;
    let result: DrawingPoint = { x: point.x - (parent ? parent.x + parent.node.strokeWidth : 0),
      y: point.y - (parent ? parent.y + parent.node.strokeWidth : 0),
      pressure: event.pointerType === 'pen' ? event.pressure : undefined };
    if (event.shiftKey && g.kind !== 'freehand' && g.points.length)
      result = constrainedPoint(g.kind === 'path' ? g.points.at(-1)! : g.points[0], result);
    return result;
  }
  onPointerDown(event: CanvasPointerEvent) {
    if (event.button !== 0 || event.isPan || !this.context || this.p.e.mode() !== 'Design') return {};
    this.cancelIfStale();
    if (!this.gesture) {
      const e = this.p.e, kind = this.p.drawingTool(); if (!kind) return {};
      const parentId = e.insertionParent('path'), parent = parentId ? this.p.byId().get(parentId) : null;
      if (parentId && (!parent || !this.p.canEdit(parent.node) || parent.node.layout !== 'free' ||
        parent.node.widthMode === 'hug' || parent.node.heightMode === 'hug')) {
        e.error.set('Draw in an unlocked, visible container with free layout and non-hug dimensions, or select the page root.'); return {};
      }
      this.gesture = { kind, id: uid(), documentId: e.doc().id, pageId: e.pageId(), revision: e.revision(),
        selection: JSON.stringify(e.selection()), parent: parent ?? null, points: [], hover: null, down: true,
        size: this.p.drawingWidth(), color: this.p.drawingColor() };
      this.p.drawingPending.set(true);
    }
    const g = this.gesture; g.down = true;
    try {
      if (g.points.length >= MAX_DRAWING_POINTS) throw Error('Path point limit reached. Finish this path before adding more points.');
      g.points.push(this.point(event)); g.hover = null; this.preview(false);
    } catch (error) { this.p.e.report(error); this.deactivate(); }
    return { cursor: this.cursor, render: true };
  }
  onPointerMove(event: CanvasPointerEvent) {
    if (!this.gesture) return { cursor: this.cursor };
    if (!this.current()) { this.deactivate(); return { render: true }; }
    const g = this.gesture;
    try {
      const point = this.point(event);
      if (g.kind === 'path') g.hover = point;
      else if (g.down && g.kind === 'freehand') {
        const previous = g.points.at(-1)!;
        if (Math.hypot(point.x - previous.x, point.y - previous.y) >= 0.25 / this.context!.camera().zoom) {
          if (g.points.length === MAX_DRAWING_POINTS) g.points = g.points.filter((_, index) => index === 0 || index % 2 === 1);
          g.points.push(point);
        }
      } else if (g.down) g.hover = point;
      this.preview(false);
    } catch (error) { this.p.e.report(error); this.deactivate(); }
    return { render: true };
  }
  onPointerUp(event: CanvasPointerEvent) {
    if (!this.gesture || !this.current()) { this.deactivate(); return { render: true }; }
    const g = this.gesture; g.down = false;
    try {
      if (g.kind === 'path') { g.hover = null; this.preview(false); }
      else {
        const point = this.point(event);
        if (g.kind === 'freehand') {
          if (g.points.length === MAX_DRAWING_POINTS) g.points = g.points.filter((_, index) => index === 0 || index % 2 === 1);
          g.points.push(point);
        } else g.hover = point;
        this.commit(false);
      }
    } catch (error) { this.p.e.report(error); this.deactivate(); }
    return { cursor: this.cursor, render: true };
  }
  private node(finished: boolean, closed: boolean): SceneNode | null {
    const g = this.gesture!;
    const points = g.hover ? [...g.points, g.hover] : g.points;
    const geometry = drawingGeometry(g.kind, points, g.size, g.color, finished, closed);
    if (!geometry) return null;
    const siblings = this.p.e.doc().nodes.filter(node => node.pageId === g.pageId && node.parentId === (g.parent?.node.id ?? null));
    const order = siblings.length ? Math.max(...siblings.map(node => node.order)) + 1 : 0;
    return NodeSchema.parse({ id: g.id, pageId: g.pageId, parentId: g.parent?.node.id ?? null,
      kind: 'path', name: { line: 'Line', arrow: 'Arrow', path: 'Path', freehand: 'Freehand stroke' }[g.kind], order, ...geometry });
  }
  private preview(finished: boolean) { const node = this.node(finished, false); this.p.draftNodes.set(node ? [node] : []); }
  private commit(closed: boolean) {
    if (!this.current()) { this.deactivate(); return; }
    const node = this.node(true, closed); this.deactivate();
    if (node && this.p.e.perform([{ type: 'node.add', node }])) {
      this.p.e.select(node.id); this.context?.selectedIds.set(this.p.e.selection());
    }
  }
  finish(closed = false) {
    if (this.gesture?.kind !== 'path') return;
    try { this.gesture.hover = null; this.commit(closed); this.p.drawingTool.set(null); }
    catch (error) { this.p.e.report(error); this.deactivate(); }
    this.context?.requestRender();
  }
  onPointerCancel() { this.deactivate(); return { render: true }; }
  onKeyDown(event: KeyboardEvent) {
    if (event.metaKey || event.ctrlKey || event.altKey) return false;
    if (event.key === 'Escape') { this.deactivate(); this.p.drawingTool.set(null); }
    else if (event.key === 'Enter' && this.gesture?.kind === 'path') this.finish(event.shiftKey);
    else if (event.key === 'Backspace' && this.gesture?.kind === 'path') {
      this.gesture.points.pop(); this.gesture.hover = null;
      if (!this.gesture.points.length) this.deactivate(); else this.preview(false);
    } else return false;
    event.preventDefault(); event.stopImmediatePropagation(); this.context?.requestRender(); return true;
  }
}
