import type { Tool, ToolContext } from './whiteboard/core/tools/tool.interface';
import type { CanvasPointerEvent } from './whiteboard/core/models/types';
import type { SceneNode } from '../model/schema';
import { hit, type Box } from './scene-layout';
import type { CanvasProjection } from './canvas-projection';
export class CanvasSelectionTool implements Tool {
  readonly name = 'select' as const;
  readonly cursor = 'default';
  private context!: ToolContext;
  private gesture: {
    start: CanvasPointerEvent;
    originals: SceneNode[];
    resize: boolean;
    documentId: string;
    pageId: string;
    revision: number;
    marquee: boolean;
  } | null = null;
  marquee: Box | null = null;
  constructor(private projection: CanvasProjection) {}
  activate(context: ToolContext) {
    this.context = context;
  }
  deactivate() {
    this.gesture = null;
    this.marquee = null;
    this.projection.draft.set({});
    this.context?.toolState.set({});
  }
  onPointerDown(event: CanvasPointerEvent) {
    if (event.button !== 0) return {};
    const p = this.projection,
      e = p.e,
      ids = e.selection();
    const selected = ids.length === 1 ? p.byId().get(ids[0]) : undefined;
    const handle =
      selected &&
      p.canResize(selected.node) &&
      Math.abs(event.canvas.x - selected.x - selected.width) < 10 / this.context.camera().zoom &&
      Math.abs(event.canvas.y - selected.y - selected.height) < 10 / this.context.camera().zoom
        ? selected
        : undefined;
    const item = handle ?? hit(p.items(), event.canvas.x, event.canvas.y);
    if (event.shiftKey && item) {
      e.select(item.node.id, true);
      return { render: true };
    }
    if (item && !ids.includes(item.node.id)) e.select(item.node.id);
    if (!item) e.select(null);
    this.context.selectedIds.set(e.selection());
    if (e.mode() !== 'Design') return { render: true };
    this.gesture = {
      start: event,
      resize: !!handle,
      documentId: e.doc().id,
      pageId: e.pageId(),
      revision: e.revision(),
      marquee: !item,
      originals: e.selectedRoots().filter((n) => (handle ? p.canResize(n) : p.canMove(n))),
    };
    return { cursor: handle ? 'nwse-resize' : item ? 'move' : 'crosshair', render: true };
  }
  onPointerMove(event: CanvasPointerEvent) {
    const g = this.gesture,
      p = this.projection;
    if (!g)
      return { cursor: hit(p.items(), event.canvas.x, event.canvas.y) ? 'pointer' : 'default' };
    if (
      g.documentId !== p.e.doc().id ||
      g.pageId !== p.e.pageId() ||
      g.revision !== p.e.revision() ||
      p.e.mode() !== 'Design'
    ) {
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
    if (Math.hypot(dx, dy) < 2 / this.context.camera().zoom) {
      p.draft.set({});
      return { render: true };
    }
    p.draft.set(
      Object.fromEntries(
        g.originals.map((n) => [
          n.id,
          g.resize
            ? {
                width: Math.max(1, Math.min(10000, n.width + dx)),
                height: Math.max(1, Math.min(10000, n.height + dy)),
              }
            : {
                x: Math.max(-100000, Math.min(100000, n.x + dx)),
                y: Math.max(-100000, Math.min(100000, n.y + dy)),
              },
        ]),
      ),
    );
    return { render: true, cursor: g.resize ? 'nwse-resize' : 'move' };
  }
  onPointerUp(event: CanvasPointerEvent) {
    const g = this.gesture,
      p = this.projection;
    if (!g) return {};
    if (
      g.documentId !== p.e.doc().id ||
      g.pageId !== p.e.pageId() ||
      g.revision !== p.e.revision() ||
      p.e.mode() !== 'Design'
    ) {
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
              !i.node.locked &&
              i.bounds.x >= box.x &&
              i.bounds.y >= box.y &&
              i.bounds.x + i.bounds.width <= box.x + box.width &&
              i.bounds.y + i.bounds.height <= box.y + box.height,
          )
          .map((i) => i.node.id),
      );
    } else {
      const operations = Object.entries(p.draft()).map(([id, patch]) => ({
        type: 'node.update' as const,
        id,
        patch,
      }));
      if (operations.length) p.e.perform(operations);
    }
    this.deactivate();
    this.context.toolState.set({});
    return { cursor: 'default', render: true };
  }
  onPointerCancel() {
    this.deactivate();
    this.context.toolState.set({});
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
