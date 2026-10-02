import type { Tool, ToolContext } from './whiteboard/core/tools/tool.interface';
import type { CanvasPointerEvent } from './whiteboard/core/models/types';
import { hit, intersects, type Box, type Item } from './scene-layout';
import {
  resizeDirection,
  resizePoint,
  snapIndex,
  snapMove,
  snapPoint,
  union,
  type Guide,
  type SnapIndex,
} from './placement-geometry';
import type { CanvasProjection } from './canvas-projection';
import { CanvasRepeatGesture } from './canvas-repeat-gesture';
import {
  angleAt,
  angleDelta,
  changedPatch,
  editableItem,
  handleCursor,
  handlePoint,
  movePatch,
  resizeDirections,
  resizePatch,
  rotationPatch,
  type TransformHandle,
} from './transform-geometry';
export class CanvasSelectionTool implements Tool {
  readonly name = 'select' as const;
  readonly cursor = 'default';
  private context!: ToolContext;
  private pendingHandle: TransformHandle | null = null;
  private gesture: {
    start: CanvasPointerEvent;
    originals: Item[];
    handle: TransformHandle | null;
    documentId: string;
    pageId: string;
    revision: number;
    marquee: boolean;
    moved: boolean;
    angle: number;
    rotationDelta: number;
    snap: SnapIndex;
    bounds: Box | null;
  } | null = null;
  marquee: Box | null = null;
  readonly repeat: CanvasRepeatGesture;
  constructor(private projection: CanvasProjection) { this.repeat = new CanvasRepeatGesture(projection); }
  activate(context: ToolContext) {
    this.context = context;
  }
  beginHandle(handle: TransformHandle) {
    this.pendingHandle = handle;
  }
  endHandleRequest() {
    this.pendingHandle = null;
  }
  deactivate() {
    this.repeat.cancel();
    this.gesture = null;
    this.pendingHandle = null;
    this.marquee = null;
    this.projection.draft.set({});
    this.context?.toolState.set({});
  }
  private handles(item: Item): TransformHandle[] {
    return [
      ...(this.projection.canResize(item.node)
        ? (Object.keys(resizeDirections) as TransformHandle[])
        : []),
      ...(this.projection.canRotate(item.node) ? ['rotate' as const] : []),
    ];
  }
  onPointerDown(event: CanvasPointerEvent) {
    if (this.repeat.start(event)) return { render: true, cursor: 'crosshair' };
    const pending = this.pendingHandle;
    this.pendingHandle = null;
    if (event.button !== 0) return {};
    const p = this.projection,
      e = p.e,
      ids = e.selection();
    const selected = ids.length === 1 ? p.byId().get(ids[0]) : undefined;
    const zoom = this.context.camera().zoom;
    const candidates = selected && e.mode() === 'Design' ? this.handles(selected) : [];
    const handle =
      pending && candidates.includes(pending)
        ? pending
        : selected
          ? (candidates
              .map((kind) => ({ kind, point: handlePoint(selected, kind, zoom) }))
              .map(({ kind, point }) => ({
                kind,
                distance: Math.hypot(event.canvas.x - point.x, event.canvas.y - point.y),
              }))
              .filter((h) => h.distance < 8 / zoom)
              .sort((a, b) => a.distance - b.distance)[0]?.kind ?? null)
          : null;
    const item = handle ? selected : hit(p.items(), event.canvas.x, event.canvas.y);
    if (event.shiftKey && item && !handle) {
      e.select(item.node.id, true);
      this.context.selectedIds.set(e.selection());
      return { render: true };
    }
    if (item && !ids.includes(item.node.id)) e.select(item.node.id);
    if (!item) e.select(null);
    this.context.selectedIds.set(e.selection());
    if (e.mode() !== 'Design') return { render: true };
    const originals = e
      .selectedRoots()
      .filter((n) =>
        handle === 'rotate' ? p.canRotate(n) : handle ? p.canResize(n) : p.canMove(n),
      )
      .map((n) => p.byId().get(n.id))
      .filter((i): i is Item => !!i);
    const moving = new Set(originals.map((i) => i.node.id));
    const camera = this.context.camera(),
      size = p.size();
    const viewport = {
      x: camera.x + size.width / 2 - size.width / (2 * zoom),
      y: camera.y + size.height / 2 - size.height / (2 * zoom),
      width: size.width / zoom,
      height: size.height / zoom,
    };
    this.gesture = {
      start: event,
      handle,
      documentId: e.doc().id,
      pageId: e.pageId(),
      revision: e.revision(),
      marquee: !item,
      moved: false,
      angle: item ? angleAt(item, event.canvas.x, event.canvas.y) : 0,
      rotationDelta: 0,
      originals,
      bounds: originals.length ? union(originals.map((i) => i.bounds)) : null,
      snap: snapIndex(
        p
          .items()
          .filter(
            (i) =>
              editableItem(i) &&
              !moving.has(i.node.id) &&
              !i.ancestors.some((a) => moving.has(a.node.id)) &&
              intersects(i.bounds, viewport) &&
              i.ancestors.every((a) => intersects(i.bounds, a.bounds)),
          ),
      ),
    };
    return {
      cursor: handle && item ? handleCursor(item, handle) : item ? 'move' : 'crosshair',
      render: true,
    };
  }
  private current() {
    const g = this.gesture,
      e = this.projection.e;
    return (
      g &&
      g.documentId === e.doc().id &&
      g.pageId === e.pageId() &&
      g.revision === e.revision() &&
      e.mode() === 'Design'
    );
  }
  onPointerMove(event: CanvasPointerEvent) {
    if (this.repeat.active) { this.repeat.move(event); return { render: true }; }
    const g = this.gesture,
      p = this.projection;
    if (!g)
      return { cursor: hit(p.items(), event.canvas.x, event.canvas.y) ? 'pointer' : 'default' };
    if (!this.current()) {
      this.deactivate();
      return { render: true };
    }
    const dx = event.canvas.x - g.start.canvas.x,
      dy = event.canvas.y - g.start.canvas.y;
    if (g.marquee) {
      this.marquee = {
        x: Math.min(event.canvas.x, g.start.canvas.x),
        y: Math.min(event.canvas.y, g.start.canvas.y),
        width: Math.abs(dx),
        height: Math.abs(dy),
      };
      this.context.toolState.set({ selectionBox: this.marquee });
      return { render: true };
    }
    if (g.handle === 'rotate' && g.originals[0]) {
      const angle = angleAt(g.originals[0], event.canvas.x, event.canvas.y);
      g.rotationDelta += angleDelta(g.angle, angle);
      g.angle = angle;
    }
    if (!g.moved && Math.hypot(dx, dy) < 2 / this.context.camera().zoom) {
      p.draft.set({});
      this.context.toolState.set({});
      return { render: true };
    }
    g.moved = true;
    let delta = { x: dx, y: dy },
      guides: Guide[] = [];
    if (p.snapping() && !event.ctrlKey && g.bounds && g.handle !== 'rotate') {
      const threshold = 6 / this.context.camera().zoom;
      if (g.handle && g.originals[0]) {
        const item = g.originals[0],
          patch = resizePatch(item, g.handle, dx, dy, event.shiftKey);
        const snapped = snapPoint(
          g.snap,
          resizePoint(item, g.handle, patch),
          threshold,
          resizeDirection(item, g.handle, event.shiftKey),
        );
        delta = { x: dx + snapped.delta.x, y: dy + snapped.delta.y };
        const actual = resizePoint(
          item,
          g.handle,
          resizePatch(item, g.handle, delta.x, delta.y, event.shiftKey),
        );
        guides = snapped.guides.filter(
          (guide) => Math.abs(actual[guide.axis] - guide.value) < 1e-6,
        );
      } else {
        const snapped = snapMove(g.snap, g.bounds, dx, dy, threshold);
        delta = { x: dx + snapped.delta.x, y: dy + snapped.delta.y };
        guides = snapped.guides;
      }
    }
    this.context.toolState.set({ snapGuides: guides });
    p.draft.set(
      Object.fromEntries(
        g.originals
          .map((item) => [
            item.node.id,
            changedPatch(
              item.node,
              g.handle === 'rotate'
                ? rotationPatch(item, g.rotationDelta, event.shiftKey)
                : g.handle
                  ? resizePatch(item, g.handle, delta.x, delta.y, event.shiftKey)
                  : movePatch(item, delta.x, delta.y),
            ),
          ])
          .filter(([, patch]) => Object.keys(patch).length),
      ),
    );
    return {
      render: true,
      cursor: g.handle && g.originals[0] ? handleCursor(g.originals[0], g.handle) : 'move',
    };
  }
  onPointerUp(event: CanvasPointerEvent) {
    if (this.repeat.active) { this.repeat.commit(event); return { render: true, cursor: 'default' }; }
    const g = this.gesture,
      p = this.projection;
    if (!g) return {};
    if (!this.current()) {
      this.deactivate();
      return { render: true };
    }
    this.onPointerMove(event);
    if (g.marquee && this.marquee) {
      const box = this.marquee;
      p.e.selection.set(
        p
          .items()
          .filter(
            (i) =>
              editableItem(i) &&
              i.bounds.x >= box.x &&
              i.bounds.y >= box.y &&
              i.bounds.x + i.bounds.width <= box.x + box.width &&
              i.bounds.y + i.bounds.height <= box.y + box.height,
          )
          .map((i) => i.node.id),
      );
      this.context.selectedIds.set(p.e.selection());
    } else {
      const operations = Object.entries(p.draft()).map(([id, patch]) => ({
        type: 'node.update' as const,
        id,
        patch,
      }));
      if (operations.length) p.e.perform(operations);
    }
    this.deactivate();
    return { cursor: 'default', render: true };
  }
  onPointerCancel() {
    this.deactivate();
    return { render: true, cursor: 'default' };
  }
  onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && (this.gesture || this.repeat.active || this.pendingHandle)) {
      event.preventDefault();
      this.onPointerCancel();
      return true;
    }
    return false;
  }
}
