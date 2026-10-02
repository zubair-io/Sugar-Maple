import { Component, computed, inject, input, output } from '@angular/core';
import { CanvasProjection } from './canvas-projection';
import {
  repeatMetrics,
  repeatSize,
  repeatLimit,
  repeatOperation,
  repeatHandlePoint,
  supportsRepeatHandles,
  type RepeatHandle,
} from './repeat-geometry';

@Component({
  selector: 'repeat-handles',
  template: `@for (h of controls(); track h.kind) {
    <button
      class="repeat-handle"
      role="slider"
      [class.gap-handle]="h.kind === 'gap'"
      [attr.aria-label]="h.label"
      [attr.aria-description]="h.description"
      [attr.title]="h.description"
      [attr.aria-valuemin]="h.kind === 'gap' ? 0 : 1"
      [attr.aria-valuemax]="h.max"
      [attr.aria-valuenow]="h.value"
      [attr.aria-valuetext]="h.text"
      [attr.aria-orientation]="h.orientation"
      [attr.data-repeat-handle]="h.kind"
      [style.left.px]="h.x"
      [style.top.px]="h.y"
      (pointerdown)="pointerRequest.emit({ event: $event, kind: h.kind })"
      (keydown)="key($event, h.kind)"
    >
      {{ h.kind === 'gap' ? '↔' : '+' }}
    </button>
  }`,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    .repeat-handle {
      position: absolute;
      pointer-events: auto;
      width: 20px;
      height: 20px;
      padding: 0;
      border: 1px solid #065f46;
      border-radius: 4px;
      background: #34d399;
      color: #052e16;
      font: 600 14px system-ui;
      cursor: crosshair;
      line-height: 18px;
    }
    .gap-handle {
      background: #a7f3d0;
      border-radius: 10px;
    }
    .repeat-handle:focus-visible {
      outline: 2px solid white;
      outline-offset: 2px;
    }
  `,
})
export class RepeatHandles {
  readonly p = inject(CanvasProjection);
  readonly zoom = input.required<number>();
  readonly pan = input.required<{ x: number; y: number }>();
  readonly enabled = input(true);
  readonly pointerRequest = output<{ event: PointerEvent; kind: RepeatHandle }>();
  readonly cancelRequest = output<void>();
  readonly controls = computed(() => {
    const e = this.p.e,
      ids = e.selection(),
      item = ids.length === 1 ? this.p.byId().get(ids[0]) : undefined;
    if (
      !this.enabled() ||
      e.mode() !== 'Design' ||
      this.p.drawingTool() ||
      !item ||
      !this.p.canEdit(item.node) ||
      !supportsRepeatHandles(e.doc(), item.node)
    )
      return [];
    const { template } = repeatMetrics(e.doc(), item.node);
    const draft = this.p.repeatDraft(),
      size = draft?.id === item.node.id ? draft : repeatSize(e.doc(), item.node);
    const kinds: RepeatHandle[] = [
      'columns',
      'rows',
      ...(size.columns > 1 || size.rows > 1 ? ['gap' as const] : []),
    ];
    return kinds.map((kind) => {
      const point = repeatHandlePoint(item, template, size, kind),
        value = Number(size[kind].toFixed(3));
      return {
        kind,
        label: `Repeat Grid ${kind}`,
        value,
        max: repeatLimit(e.doc(), item.node, size, kind),
        text: kind === 'gap' ? `${value} design units` : `${value} ${kind}`,
        orientation:
          kind === 'rows' || (kind === 'gap' && size.columns === 1) ? 'vertical' : 'horizontal',
        x: point.x * this.zoom() + this.pan().x - 10,
        y: point.y * this.zoom() + this.pan().y - 10,
        description: `Drag to change ${kind}. Arrow keys adjust by ${kind === 'gap' ? 'one design unit' : 'one'}; Shift adjusts by ten. Home/End select the supported limits. Counts are limited to 100 cells.`,
      };
    });
  });
  key(event: KeyboardEvent, kind: RepeatHandle) {
    if (event.key === 'Escape' && this.p.repeatPending()) {
      event.preventDefault();
      event.stopPropagation();
      this.cancelRequest.emit();
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key))
      return;
    event.preventDefault();
    event.stopPropagation();
    const e = this.p.e,
      ids = e.selection(),
      grid = ids.length === 1 ? e.doc().nodes.find((n) => n.id === ids[0]) : undefined;
    if (!this.controls().some((h) => h.kind === kind) || !grid || this.p.repeatPending()) return;
    const size = repeatSize(e.doc(), grid),
      max = repeatLimit(e.doc(), grid, size, kind),
      min = kind === 'gap' ? 0 : 1;
    const delta =
      (['ArrowRight', 'ArrowUp'].includes(event.key) ? 1 : -1) * (event.shiftKey ? 10 : 1);
    const value =
      event.key === 'Home'
        ? min
        : event.key === 'End'
          ? max
          : Math.max(min, Math.min(max, size[kind] + delta));
    if (Math.abs(value - size[kind]) > 1e-8)
      e.perform([repeatOperation({ ...size, [kind]: value }, kind === 'gap')]);
  }
}
