import type {
  Tool,
  ToolContext,
} from "./vendor/whiteboard/core/tools/tool.interface";
import type { CanvasPointerEvent } from "./vendor/whiteboard/core/models/types";
import { contains, hit, type Item } from "./layout";
import { SceneSession } from "./session";
export class UITool implements Tool {
  readonly name = "select" as const;
  readonly cursor = "default";
  private context!: ToolContext;
  private start: CanvasPointerEvent | null = null;
  private originals: Item[] = [];
  private resize = false;
  private lastClick = 0;
  constructor(private s: SceneSession) {}
  activate(c: ToolContext) {
    this.context = c;
  }
  deactivate() {
    this.start = null;
    this.s.draft.set({});
  }
  onPointerDown(e: CanvasPointerEvent) {
    const handle = this.s
      .items()
      .find(
        (i) =>
          this.s.selected().includes(i.node.id) &&
          Math.abs(e.canvas.x - i.x - i.width) <
            10 / this.context.camera().zoom &&
          Math.abs(e.canvas.y - i.y - i.height) <
            10 / this.context.camera().zoom,
      );
    const item = handle ?? hit(this.s.items(), e.canvas.x, e.canvas.y);
    if (!item) {
      this.s.selected.set([]);
      this.context.selectedIds.set([]);
      return { render: true };
    }
    if (this.s.preview()) {
      this.s.activate(item);
      return { render: true };
    }
    const prior = this.s.selected();
    this.resize =
      prior.includes(item.node.id) &&
      Math.abs(e.canvas.x - item.x - item.width) <
        10 / this.context.camera().zoom &&
      Math.abs(e.canvas.y - item.y - item.height) <
        10 / this.context.camera().zoom;
    const ids = e.shiftKey
      ? [...new Set([...prior, item.node.id])]
      : this.resize
        ? prior
        : [item.node.id];
    this.s.selected.set(ids);
    this.context.selectedIds.set(ids);
    this.start = e;
    this.originals = this.s.items().filter((i) => ids.includes(i.node.id));
    const now = performance.now();
    if (
      now - this.lastClick < 330 &&
      (item.node.kind === "text" || item.node.kind === "button")
    )
      this.s.onTextEdit();
    this.lastClick = now;
    return { cursor: this.resize ? "nwse-resize" : "move", render: true };
  }
  onPointerMove(e: CanvasPointerEvent) {
    if (!this.start)
      return {
        cursor: hit(this.s.items(), e.canvas.x, e.canvas.y)
          ? "pointer"
          : "default",
      };
    const dx = e.canvas.x - this.start.canvas.x,
      dy = e.canvas.y - this.start.canvas.y;
    if (Math.hypot(dx, dy) < 2 / this.context.camera().zoom) return {};
    this.s.draft.set(
      Object.fromEntries(
        this.originals.map((i) => [
          i.node.id,
          this.resize
            ? {
                width: Math.max(1, i.node.width + dx),
                height: Math.max(1, i.node.height + dy),
              }
            : { x: i.node.x + dx, y: i.node.y + dy },
        ]),
      ),
    );
    this.s.notify();
    return { cursor: this.resize ? "nwse-resize" : "move", render: true };
  }
  onPointerUp(e: CanvasPointerEvent) {
    if (this.start) {
      const changes = this.s.draft();
      const operations = Object.entries(changes)
        .filter(([id, p]) =>
          Object.entries(p).some(
            ([k, v]) =>
              this.s.doc().nodes.find((n) => n.id === id)?.[k as "x"] !== v,
          ),
        )
        .map(([id, patch]) => ({ type: "node.update" as const, id, patch }));
      if (operations.length) this.s.command(operations);
      this.s.draft.set({});
      this.start = null;
    }
    return { cursor: "default", render: true };
  }
  onPointerLeave() {}
  onKeyDown(e: KeyboardEvent) {
    if (
      (e.target as HTMLElement)?.closest(
        "input,textarea,select,[contenteditable=true]",
      )
    )
      return false;
    if (e.key === "Escape") {
      this.s.selected.set([]);
      this.context.selectedIds.set([]);
      this.s.notify();
      return true;
    }
    if (
      e.key.startsWith("Arrow") &&
      this.s.selected().length &&
      !this.s.preview()
    ) {
      e.preventDefault();
      const d = e.shiftKey ? 10 : 1;
      this.s.command(
        this.s
          .doc()
          .nodes.filter((n) => this.s.selected().includes(n.id))
          .map((n) => ({
            type: "node.update",
            id: n.id,
            patch: {
              x:
                n.x +
                (e.key === "ArrowRight" ? d : e.key === "ArrowLeft" ? -d : 0),
              y:
                n.y +
                (e.key === "ArrowDown" ? d : e.key === "ArrowUp" ? -d : 0),
            },
          })),
      );
      return true;
    }
    return false;
  }
}
