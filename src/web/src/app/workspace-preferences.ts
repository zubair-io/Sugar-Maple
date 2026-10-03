import { Injectable, OnDestroy, computed, signal } from '@angular/core';
const key = 'sugar-maple.workspace.v1';
const limits = { left: [220, 400], right: [260, 420] } as const;
type Side = keyof typeof limits;
interface Preference {
  version: 1;
  left: number;
  right: number;
  leftOpen: boolean;
  rightOpen: boolean;
  requested: Side;
}
const defaults: Preference = {
  version: 1,
  left: 280,
  right: 320,
  leftOpen: true,
  rightOpen: true,
  requested: 'right',
};
const clamp = (side: Side, value: number) =>
  Math.max(limits[side][0], Math.min(limits[side][1], value));
@Injectable({ providedIn: 'root' })
export class WorkspacePreferences implements OnDestroy {
  readonly state = signal<Preference>(this.read());
  readonly windowWidth = signal(window.innerWidth);
  readonly constrained = computed(
    () => this.windowWidth() < this.state().left + this.state().right + 320,
  );
  readonly leftVisible = computed(() => {
    const s = this.state();
    return s.leftOpen && (!s.rightOpen || !this.constrained() || s.requested === 'left');
  });
  readonly rightVisible = computed(() => {
    const s = this.state();
    return s.rightOpen && (!s.leftOpen || !this.constrained() || s.requested === 'right');
  });
  readonly canvasWidth = computed(
    () =>
      this.windowWidth() -
      (this.leftVisible() ? this.state().left : 0) -
      (this.rightVisible() ? this.state().right : 0),
  );
  private resizing: AbortController | null = null;
  private read(): Preference {
    try {
      const s = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (!s || s.version !== 1) return { ...defaults };
      return {
        version: 1,
        left: clamp('left', Number.isFinite(s.left) ? s.left : 280),
        right: clamp('right', Number.isFinite(s.right) ? s.right : 320),
        leftOpen: typeof s.leftOpen === 'boolean' ? s.leftOpen : true,
        rightOpen: typeof s.rightOpen === 'boolean' ? s.rightOpen : true,
        requested: s.requested === 'left' ? 'left' : 'right',
      };
    } catch {
      return { ...defaults };
    }
  }
  private save() {
    try {
      localStorage.setItem(key, JSON.stringify(this.state()));
    } catch {
      /* In-memory workspace remains usable. */
    }
  }
  toggle(side: Side) {
    const visible = side === 'left' ? this.leftVisible() : this.rightVisible();
    this.state.update((s) => ({ ...s, [side + 'Open']: !visible, requested: side }));
    this.save();
  }
  open(side: Side) {
    this.state.update((s) => ({ ...s, [side + 'Open']: true, requested: side }));
    this.save();
  }
  resize(side: Side, value: number) {
    if (Number.isFinite(value)) this.state.update((s) => ({ ...s, [side]: clamp(side, value) }));
  }
  keyboard(side: Side, event: KeyboardEvent) {
    const value = this.state()[side];
    let next: number;
    if (event.key === 'Home') next = limits[side][0];
    else if (event.key === 'End') next = limits[side][1];
    else if (event.key === 'ArrowLeft') next = value - 10;
    else if (event.key === 'ArrowRight') next = value + 10;
    else return;
    event.preventDefault();
    event.stopPropagation();
    this.resize(side, next);
    this.save();
  }
  startResize(side: Side, event: PointerEvent) {
    if (event.button !== 0) return;
    event.preventDefault();
    this.resizing?.abort();
    const controller = new AbortController();
    this.resizing = controller;
    const start = this.state()[side],
      x = event.clientX,
      id = event.pointerId;
    const element = event.currentTarget as HTMLElement;
    element.focus();
    element.setPointerCapture(id);
    const finish = (cancel = false) => {
      controller.abort();
      this.resizing = null;
      if (cancel) this.resize(side, start);
      this.save();
      if (element.hasPointerCapture(id)) element.releasePointerCapture(id);
    };
    element.addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerId === id)
          this.resize(side, start + (e.clientX - x) * (side === 'left' ? 1 : -1));
      },
      { signal: controller.signal },
    );
    element.addEventListener(
      'pointerup',
      (e) => {
        if (e.pointerId === id) finish();
      },
      { signal: controller.signal },
    );
    element.addEventListener('pointercancel', () => finish(true), { signal: controller.signal });
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          finish(true);
        }
      },
      { signal: controller.signal },
    );
  }
  ngOnDestroy() {
    this.resizing?.abort();
  }
}
