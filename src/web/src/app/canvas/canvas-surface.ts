import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { CanvasComponent } from './whiteboard/core/components/canvas/canvas.component';
import { WHITEBOARD_USER_PROVIDER } from './whiteboard/collaboration/tokens';
import type { Camera } from './whiteboard/shared-types';
import { CanvasProjection } from './canvas-projection';
import { CanvasSelectionTool } from './canvas-selection-tool';
import {
  changedPatch,
  handleCursor,
  handlePoint,
  resizeDirections,
  resizePatch,
  rotationPatch,
  type TransformHandle,
} from './transform-geometry';
@Component({
  selector: 'canvas-surface',
  imports: [CanvasComponent],
  providers: [
    { provide: WHITEBOARD_USER_PROVIDER, useValue: { user: signal({ _id: 'local-editor' }) } },
  ],
  template: `<app-whiteboard-canvas
      [whiteboard]="p.board"
      [pageId]="p.e.pageId()"
      [activeTool]="enabled() ? tool : null"
      [enabled]="enabled()"
      (cameraChange)="cameraChanged($event)"
      (sizeChange)="p.size.set($event)"
    />
    @for (h of handles(); track h.kind) {
      <button
        class="resize-handle"
        [attr.aria-label]="h.label"
        [attr.aria-description]="h.description"
        [attr.title]="h.description"
        [attr.data-transform-handle]="h.kind"
        [class.rotate-handle]="h.kind === 'rotate'"
        [style.cursor]="h.cursor"
        [style.left.px]="h.x"
        [style.top.px]="h.y"
        (pointerdown)="handleDown($event, h.kind)"
        (keydown)="handleKey($event, h.kind)"
      ></button>
    }`,
  styles: `
    :host {
      display: block;
      position: absolute;
      inset: 0;
    }
    .resize-handle {
      position: absolute;
      width: 10px;
      height: 10px;
      padding: 0;
      border: 1px solid #3b82f6;
      background: white;
      border-radius: 0;
      cursor: nwse-resize;
    }
    .rotate-handle {
      border-radius: 50%;
    }
  `,
})
export class CanvasSurface {
  readonly p = inject(CanvasProjection);
  readonly tool = new CanvasSelectionTool(this.p);
  readonly board = viewChild(CanvasComponent);
  readonly zoom = input.required<number>();
  readonly pan = input.required<{ x: number; y: number }>();
  readonly enabled = input(true);
  readonly cameraChange = output<{ zoom: number; pan: { x: number; y: number } }>();
  readonly handles = computed(() => {
    const ids = this.p.e.selection(),
      i = ids.length === 1 ? this.p.byId().get(ids[0]) : undefined;
    if (!this.enabled() || this.p.e.mode() !== 'Design' || !i) return [];
    const labels = {
      nw: 'top left',
      n: 'top',
      ne: 'top right',
      e: 'right',
      se: '',
      s: 'bottom',
      sw: 'bottom left',
      w: 'left',
    };
    const kinds: TransformHandle[] = [
      ...(this.p.canResize(i.node) ? (Object.keys(resizeDirections) as TransformHandle[]) : []),
      ...(this.p.canRotate(i.node) ? ['rotate' as const] : []),
    ];
    return kinds.map((kind) => {
      const point = handlePoint(i, kind, this.zoom());
      return {
        kind,
        x: point.x * this.zoom() + this.pan().x - 5,
        y: point.y * this.zoom() + this.pan().y - 5,
        label:
          kind === 'rotate'
            ? 'Rotate selected element'
            : kind === 'se'
              ? 'Resize selected element'
              : `Resize selected element from ${labels[kind]}`,
        description:
          kind === 'rotate'
            ? 'Drag to rotate. Hold Shift to snap to 15 degrees. Arrow keys rotate by 1 degree, or 10 with Shift.'
            : 'Drag to resize. Hold Shift to preserve proportions. Arrow keys move this handle by 1 design unit, or 10 with Shift.',
        cursor: handleCursor(i, kind),
      };
    });
  });
  constructor() {
    effect(() => {
      this.p.e.mode();
      this.p.e.doc().id;
      this.p.e.pageId();
      this.p.e.revision();
      const board = this.board();
      untracked(() => {
        this.tool.deactivate();
        board?.onBlur();
      });
    });
    effect(() => {
      const board = this.board(),
        size = this.p.size(),
        zoom = this.zoom(),
        pan = this.pan(),
        enabled = this.enabled();
      if (board)
        untracked(() => {
          board.camera.set({
            x: (size.width / 2 - pan.x) / zoom - size.width / 2,
            y: (size.height / 2 - pan.y) / zoom - size.height / 2,
            zoom,
          });
          if (!enabled) {
            this.tool.deactivate();
            board.onBlur();
          }
          board.requestRender();
        });
    });
  }
  cameraChanged(camera: Camera) {
    const size = this.p.size();
    this.cameraChange.emit({
      zoom: camera.zoom,
      pan: {
        x: size.width / 2 - (camera.x + size.width / 2) * camera.zoom,
        y: size.height / 2 - (camera.y + size.height / 2) * camera.zoom,
      },
    });
  }
  flush() {
    this.board()?.flush();
  }
  handleDown(event: PointerEvent, handle: TransformHandle) {
    if (!this.enabled() || this.p.e.mode() !== 'Design' || event.button !== 0 || !event.isPrimary)
      return;
    this.tool.beginHandle(handle);
    this.board()?.onPointerDown(event);
    this.tool.endHandleRequest();
  }
  handleKey(event: KeyboardEvent, handle: TransformHandle) {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const ids = this.p.e.selection(),
      item = ids.length === 1 ? this.p.byId().get(ids[0]) : undefined;
    if (
      !this.enabled() ||
      this.p.e.mode() !== 'Design' ||
      !item ||
      !(handle === 'rotate' ? this.p.canRotate(item.node) : this.p.canResize(item.node))
    )
      return;
    const step = event.shiftKey ? 10 : 1;
    const dx = event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0;
    const dy = event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0;
    const patch = changedPatch(
      item.node,
      handle === 'rotate' ? rotationPatch(item, dx + dy) : resizePatch(item, handle, dx, dy),
    );
    if (Object.keys(patch).length) this.p.e.update(patch);
  }
}
