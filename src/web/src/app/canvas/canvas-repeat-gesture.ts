import type { CanvasPointerEvent } from './whiteboard/core/models/types';
import type { CanvasProjection } from './canvas-projection';
import { inverse, type Item } from './scene-layout';
import {
  repeatSize,
  resizeRepeat,
  repeatOperation,
  supportsRepeatHandles,
  type RepeatHandle,
  type RepeatSize,
} from './repeat-geometry';

export class CanvasRepeatGesture {
  private pending: RepeatHandle | null = null;
  private gesture: {
    kind: RepeatHandle;
    item: Item;
    start: { x: number; y: number };
    size: RepeatSize;
    documentId: string;
    pageId: string;
    revision: number;
    namespace: string;
  } | null = null;
  constructor(private p: CanvasProjection) {}
  get active() {
    return this.gesture !== null;
  }
  request(kind: RepeatHandle) {
    this.pending = kind;
  }
  endRequest() {
    this.pending = null;
  }
  start(event: CanvasPointerEvent) {
    const kind = this.pending;
    this.pending = null;
    if (!kind) return false;
    const e = this.p.e,
      ids = e.selection(),
      item = ids.length === 1 ? this.p.byId().get(ids[0]) : undefined;
    if (
      event.button !== 0 ||
      !item ||
      e.mode() !== 'Design' ||
      !this.p.canEdit(item.node) ||
      !supportsRepeatHandles(e.doc(), item.node)
    )
      return true;
    this.gesture = {
      kind,
      item,
      start: inverse(item.transform, event.canvas.x, event.canvas.y),
      size: repeatSize(e.doc(), item.node),
      documentId: e.doc().id,
      pageId: e.pageId(),
      revision: e.revision(),
      namespace: crypto.randomUUID(),
    };
    this.p.repeatPending.set(true);
    return true;
  }
  current() {
    const g = this.gesture,
      e = this.p.e;
    return (
      !!g &&
      g.documentId === e.doc().id &&
      g.pageId === e.pageId() &&
      g.revision === e.revision() &&
      e.mode() === 'Design' &&
      !this.p.drawingTool() &&
      e.selection().length === 1 &&
      e.selection()[0] === g.item.node.id
    );
  }
  move(event: CanvasPointerEvent) {
    const g = this.gesture;
    if (!g) return;
    if (!this.current()) {
      this.cancel();
      return;
    }
    const point = inverse(g.item.transform, event.canvas.x, event.canvas.y);
    const axis = g.kind === 'rows' || (g.kind === 'gap' && g.size.columns === 1) ? 'y' : 'x';
    // A gutter's center travels by half of its total width change.
    const delta = (point[axis] - g.start[axis]) * (g.kind === 'gap' ? 2 : 1);
    const size = resizeRepeat(this.p.e.doc(), g.item.node, g.size, g.kind, delta);
    const changed =
      size.rows !== g.size.rows ||
      size.columns !== g.size.columns ||
      Math.abs(size.gap - g.size.gap) > 1e-8;
    this.p.repeatDraft.set(
      changed
        ? {
            ...size,
            namespace: g.namespace,
            preserveCount: g.kind === 'gap',
            source: { documentId: g.documentId, pageId: g.pageId, revision: g.revision },
          }
        : null,
    );
  }
  commit(event: CanvasPointerEvent) {
    if (!this.current()) {
      this.cancel();
      return;
    }
    this.move(event);
    const draft = this.p.repeatDraft();
    // Clear the ephemeral projection before the shared dispatcher publishes.
    this.cancel();
    if (draft) this.p.e.perform([repeatOperation(draft, draft.preserveCount)]);
  }
  cancel() {
    this.pending = null;
    this.gesture = null;
    this.p.repeatPending.set(false);
    this.p.repeatDraft.set(null);
  }
}
