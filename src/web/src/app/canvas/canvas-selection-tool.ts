import type { Tool, ToolContext } from './whiteboard/core/tools/tool.interface';
import type { CanvasPointerEvent } from './whiteboard/core/models/types';
import { hit, type Box, type Item } from './scene-layout';
import type { CanvasProjection } from './canvas-projection';
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
  } | null = null;
  marquee: Box | null = null;
  constructor(private projection: CanvasProjection) {}
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
      originals: e
        .selectedRoots()
        .filter((n) =>
          handle === 'rotate' ? p.canRotate(n) : handle ? p.canResize(n) : p.canMove(n),
        )
        .map((n) => p.byId().get(n.id))
        .filter((i): i is Item => !!i),
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
      this.context.toolState.set({ selectionBox: this.marquee } as any);
      return { render: true };
    }
    if (g.handle === 'rotate' && g.originals[0]) {
      const angle = angleAt(g.originals[0], event.canvas.x, event.canvas.y);
      g.rotationDelta += angleDelta(g.angle, angle);
      g.angle = angle;
    }
    if (!g.moved && Math.hypot(dx, dy) < 2 / this.context.camera().zoom) {
      p.draft.set({});
      return { render: true };
    }
    g.moved = true;
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
                  ? resizePatch(item, g.handle, dx, dy, event.shiftKey)
                  : movePatch(item, dx, dy),
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
    if (event.key === 'Escape') {
      this.onPointerCancel();
      return true;
    }
    return false;
  }
}
