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
    @if (handle(); as h) {
      <button
        class="resize-handle"
        aria-label="Resize selected element"
        [style.left.px]="h.x"
        [style.top.px]="h.y"
        (pointerdown)="board()?.onPointerDown($event)"
        (keydown)="resizeKey($event)"
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
  readonly handle = computed(() => {
    const ids = this.p.e.selection(),
      i = ids.length === 1 ? this.p.byId().get(ids[0]) : undefined;
    return this.enabled() && this.p.e.mode() === 'Design' && i && this.p.canResize(i.node)
      ? {
          x: (i.x + i.width) * this.zoom() + this.pan().x - 5,
          y: (i.y + i.height) * this.zoom() + this.pan().y - 5,
        }
      : null;
  });
  constructor() {
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
  resizeKey(event: KeyboardEvent) {
    if (!event.key.startsWith('Arrow')) return;
    event.preventDefault();
    event.stopPropagation();
    const n = this.p.e.node();
    if (!n) return;
    const step = event.shiftKey ? 10 : 1;
    this.p.e.update({
      width: Math.min(
        10000,
        Math.max(
          1,
          n.width + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0),
        ),
      ),
      height: Math.min(
        10000,
        Math.max(
          1,
          n.height + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0),
        ),
      ),
    });
  }
}
