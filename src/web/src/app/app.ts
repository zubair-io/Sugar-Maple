import { cloneTree } from './model/composition';
import { Component, inject, signal, computed, HostListener } from '@angular/core';
import { KeyValuePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EditorService } from './editor.service';
import { SceneNodeView } from './canvas/scene-node';
import { MuiButtonComponent } from './chrome/maple/ui/button/mui-button.component';
import { SceneNode, uid, Operation } from './model/schema';
import { exportNode, ExportTarget } from './model/export';
@Component({
  selector: 'app-root',
  imports: [KeyValuePipe, FormsModule, SceneNodeView, MuiButtonComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  readonly e = inject(EditorService);
  readonly zoom = signal(0.8);
  readonly pan = signal({ x: 0, y: 0 });
  readonly tab = signal('Layers');
  readonly target = signal<ExportTarget>('html');
  readonly preview = signal<string | null>(null);
  readonly previewWidth = signal<number | null>(null);
  readonly search = signal('');
  readonly layers = computed(() => {
    const all = this.e.pageNodes(),
      rows: { node: SceneNode; depth: number }[] = [];
    const visit = (parentId: string | null, depth: number) => {
      for (const node of all.filter((n) => n.parentId === parentId)) {
        if (node.name.toLowerCase().includes(this.search().toLowerCase()))
          rows.push({ node, depth });
        visit(node.id, depth + 1);
      }
    };
    visit(null, 0);
    return rows;
  });
  readonly previewHistory: string[] = [];
  readonly left = signal(true);
  readonly right = signal(true);
  readonly code = computed(() => {
    try {
      return this.e.selected() ? exportNode(this.e.doc(), this.e.selected()!, this.target()) : '';
    } catch (error) {
      return 'Unsupported export: ' + (error instanceof Error ? error.message : String(error));
    }
  });
  readonly previewNode = computed(() => {
    const n = this.e.doc().nodes.find((n) => n.id === this.preview());
    return n
      ? { ...n, x: 0, y: 0, width: this.previewWidth() ?? n.width, widthMode: 'fixed' as const }
      : null;
  });
  readonly parentOptions = computed(() =>
    this.e
      .pageNodes()
      .filter((n) => ['artboard', 'frame'].includes(n.kind) && n.id !== this.e.selected()),
  );
  readonly numericFields = [
    'x',
    'y',
    'width',
    'height',
    'rotation',
    'radius',
    'fontSize',
    'fontWeight',
    'gap',
    'padding',
    'columns',
    'strokeWidth',
  ] as const;
  readonly kinds = [
    'artboard',
    'frame',
    'rectangle',
    'ellipse',
    'text',
    'button',
    'input',
  ] as const;
  readonly targets: ExportTarget[] = [
    'html',
    'tailwind',
    'angular',
    'css',
    'swiftui',
    'editable',
    'svg',
  ];
  readonly modes = ['Design', 'Prototype', 'Developer'] as const;
  readonly marquee = signal<{ x: number; y: number; width: number; height: number } | null>(null);
  private gesture: {
    id?: string;
    marquee?: boolean;
    nodes?: { id: string; x: number; y: number; element: HTMLElement }[];
    startX: number;
    startY: number;
    x: number;
    y: number;
    width?: number;
    height?: number;
    resize?: boolean;
    pan?: boolean;
    element?: HTMLElement;
  } | null = null;
  constructor() {
    window.sugarMaple.viewport = {
      fit: () => {
        this.fit();
        return { zoom: this.zoom(), pan: this.pan() };
      },
    };
  }
  fillStyle(type: string) {
    const n = this.e.node();
    if (!n) return;
    this.e.update({
      gradient:
        type === 'solid'
          ? null
          : {
              type: type as 'linear' | 'radial',
              angle: 180,
              centerX: 50,
              centerY: 50,
              radiusX: 50,
              radiusY: 50,
              stops: [
                { offset: 0, color: n.fill, opacity: 1 },
                { offset: 1, color: '#18181b', opacity: 1 },
              ],
            },
    });
  }
  gradientStop(index: number, color: string) {
    const gradient = this.e.node()?.gradient;
    if (!gradient) return;
    this.e.update({
      gradient: {
        ...gradient,
        stops: gradient.stops.map((s, i) => (i === index ? { ...s, color } : s)),
      },
    });
  }
  value(event: Event) {
    return (event.target as HTMLInputElement).value;
  }
  patch(key: string, value: any) {
    this.e.update({ [key]: value });
  }
  renamePage(id: string, name: string) {
    const next = prompt('Page name', name);
    if (next?.trim()) this.e.perform([{ type: 'page.update', id, name: next.trim() }]);
  }
  reorder(direction: number) {
    const n = this.e.node();
    if (!n) return;
    const siblings = this.e.pageNodes().filter((v) => v.parentId === n.parentId);
    const index = siblings.findIndex((v) => v.id === n.id),
      next = index + direction;
    if (next < 0 || next >= siblings.length) return;
    [siblings[index], siblings[next]] = [siblings[next], siblings[index]];
    this.e.perform(
      siblings.map((v, order) => ({ type: 'node.update', id: v.id, patch: { order } })),
    );
  }
  addPage() {
    const r = this.e.perform([
      { type: 'page.add', name: 'Page ' + (this.e.doc().pages.length + 1) },
    ]);
    if (r) this.e.pageId.set(r.ids[0]);
  }
  selectPage(id: string) {
    this.e.pageId.set(id);
    this.e.select(null);
  }
  canMove(n: SceneNode) {
    if (n.locked) return false;
    const parent = this.e.doc().nodes.find((p) => p.id === n.parentId);
    if (parent && parent.layout !== 'free') return false;
    let ancestor = parent;
    while (ancestor) {
      if (ancestor.rotation) return false;
      ancestor = this.e.doc().nodes.find((p) => p.id === ancestor!.parentId);
    }
    return true;
  }
  pick({ event, node }: { event: PointerEvent; node: SceneNode }) {
    event.stopPropagation();
    if (event.button !== 0 || node.locked) return;
    if (event.shiftKey) {
      this.e.select(node.id, true);
      return;
    }
    if (!this.e.selection().includes(node.id)) this.e.select(node.id);
    if (this.e.mode() !== 'Design') return;
    const parent = this.e.doc().nodes.find((n) => n.id === node.parentId);
    if (!this.canMove(node)) return;
    this.gesture = {
      id: node.id,
      nodes: this.e
        .selectedRoots()
        .filter((n) => this.canMove(n))
        .map((n) => ({
          id: n.id,
          x: n.x,
          y: n.y,
          element: document.querySelector(`[data-node-id="${n.id}"]`)!,
        })),
      startX: event.clientX,
      startY: event.clientY,
      x: node.x,
      y: node.y,
      element: event.currentTarget as HTMLElement,
    };
  }
  resize(event: PointerEvent) {
    event.stopPropagation();
    const n = this.e.node();
    if (!n) return;
    this.gesture = {
      id: n.id,
      startX: event.clientX,
      startY: event.clientY,
      x: n.x,
      y: n.y,
      width: n.width,
      height: n.height,
      resize: true,
      element: document.querySelector(`[data-node-id="${n.id}"]`)!,
    };
  }
  background(event: PointerEvent) {
    if (event.button === 1 || event.altKey) {
      event.preventDefault();
      this.gesture = {
        startX: event.clientX,
        startY: event.clientY,
        x: this.pan().x,
        y: this.pan().y,
        pan: true,
      };
    } else if (event.button === 0) {
      this.e.select(null);
      this.gesture = { startX: event.clientX, startY: event.clientY, x: 0, y: 0, marquee: true };
    }
  }
  @HostListener('window:pointermove', ['$event']) move(event: PointerEvent) {
    const g = this.gesture;
    if (!g) return;
    const dx = event.clientX - g.startX,
      dy = event.clientY - g.startY;
    if (g.marquee) {
      const viewport = document.querySelector('.viewport')!.getBoundingClientRect();
      this.marquee.set({
        x: Math.min(event.clientX, g.startX) - viewport.x,
        y: Math.min(event.clientY, g.startY) - viewport.y,
        width: Math.abs(dx),
        height: Math.abs(dy),
      });
      return;
    }
    if (g.pan) {
      this.pan.set({ x: g.x + dx, y: g.y + dy });
      return;
    }
    if (!g.element) return;
    if (g.resize) {
      g.element.style.width = Math.max(1, g.width! + dx / this.zoom()) + 'px';
      g.element.style.height = Math.max(1, g.height! + dy / this.zoom()) + 'px';
    } else {
      for (const n of g.nodes ?? []) {
        n.element.style.left = n.x + dx / this.zoom() + 'px';
        n.element.style.top = n.y + dy / this.zoom() + 'px';
      }
    }
  }
  @HostListener('window:pointerup', ['$event']) end(event: PointerEvent) {
    const g = this.gesture;
    this.gesture = null;
    if (g?.marquee) {
      this.marquee.set(null);
      const x = Math.min(g.startX, event.clientX),
        y = Math.min(g.startY, event.clientY),
        right = Math.max(g.startX, event.clientX),
        bottom = Math.max(g.startY, event.clientY);
      this.e.selection.set(
        this.e
          .pageNodes()
          .filter((n) => {
            const r = document.querySelector(`[data-node-id="${n.id}"]`)?.getBoundingClientRect();
            return !n.locked && r && r.x >= x && r.y >= y && r.right <= right && r.bottom <= bottom;
          })
          .map((n) => n.id),
      );
      return;
    }
    if (!g?.id) return;
    const dx = (event.clientX - g.startX) / this.zoom(),
      dy = (event.clientY - g.startY) / this.zoom();
    if (Math.abs(dx) + Math.abs(dy) < 1) return;
    this.e.perform(
      g.resize
        ? [
            {
              type: 'node.update',
              id: g.id,
              patch: {
                width: Math.min(10000, Math.max(1, g.width! + dx)),
                height: Math.min(10000, Math.max(1, g.height! + dy)),
              },
            },
          ]
        : (g.nodes ?? []).map((n) => ({
            type: 'node.update',
            id: n.id,
            patch: {
              x: Math.max(-100000, Math.min(100000, n.x + dx)),
              y: Math.max(-100000, Math.min(100000, n.y + dy)),
            },
          })),
    );
    for (const n of g.nodes ?? []) {
      const saved = this.e.doc().nodes.find((v) => v.id === n.id)!;
      n.element.style.left = saved.x + 'px';
      n.element.style.top = saved.y + 'px';
    }
  }
  wheel(event: WheelEvent) {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      this.zoom.set(Math.min(3, Math.max(0.1, this.zoom() * Math.exp(-event.deltaY * 0.01))));
    } else this.pan.update((p) => ({ x: p.x - event.deltaX, y: p.y - event.deltaY }));
  }
  fit() {
    const nodes = this.e.roots();
    if (!nodes.length) return;
    const minX = Math.min(...nodes.map((n) => n.x)),
      minY = Math.min(...nodes.map((n) => n.y));
    const width = Math.max(...nodes.map((n) => n.x + n.width)) - minX;
    const height = Math.max(...nodes.map((n) => n.y + n.height)) - minY;
    const board = document.querySelector('.viewport')!.getBoundingClientRect();
    const zoom = Math.max(
      0.01,
      Math.min(1, (board.width - 80) / width, (board.height - 80) / height),
    );
    this.zoom.set(zoom);
    this.pan.set({
      x: (board.width - width * zoom) / 2 - minX * zoom,
      y: (board.height - height * zoom) / 2 - minY * zoom,
    });
  }
  world(n: SceneNode) {
    let x = n.x,
      y = n.y;
    let p = n.parentId;
    while (p) {
      const parent = this.e.doc().nodes.find((v) => v.id === p)!;
      x += parent.x;
      y += parent.y;
      p = parent.parentId;
    }
    return { x, y };
  }
  align(axis: 'x' | 'y') {
    const nodes = this.e.selectedRoots().filter((n) => !n.locked);
    if (nodes.length < 2 || nodes.some((n) => n.parentId !== nodes[0].parentId)) {
      this.e.error.set('Select siblings to align.');
      return;
    }
    const value = Math.min(...nodes.map((n) => n[axis]));
    this.e.perform(nodes.map((n) => ({ type: 'node.update', id: n.id, patch: { [axis]: value } })));
  }
  group() {
    const nodes = this.e.selectedRoots();
    if (
      nodes.length < 2 ||
      nodes.some((n) => n.locked || n.rotation || n.parentId !== nodes[0].parentId) ||
      this.e.doc().nodes.some((n) => n.id === nodes[0].parentId && n.layout !== 'free')
    ) {
      this.e.error.set('Group unlocked, unrotated siblings in a free layout.');
      return;
    }
    const x = Math.min(...nodes.map((n) => n.x)),
      y = Math.min(...nodes.map((n) => n.y)),
      id = uid();
    const result = this.e.perform([
      {
        type: 'node.add',
        node: {
          id,
          kind: 'frame',
          pageId: this.e.pageId(),
          parentId: nodes[0].parentId,
          name: 'Group',
          fillEnabled: false,
          x,
          y,
          width: Math.max(...nodes.map((n) => n.x + n.width)) - x,
          height: Math.max(...nodes.map((n) => n.y + n.height)) - y,
          padding: 0,
        },
      },
      ...nodes.map((n) => ({
        type: 'node.update' as const,
        id: n.id,
        patch: { parentId: id, x: n.x - x, y: n.y - y },
      })),
    ]);
    if (result) this.e.select(id);
  }
  startPreview() {
    const n = this.e.node();
    const board = n?.kind === 'artboard' ? n : this.e.roots().find((n) => n.kind === 'artboard');
    if (board) {
      this.previewWidth.set(null);
      this.previewHistory.length = 0;
      this.preview.set(board.id);
    } else this.e.error.set('Create an artboard to preview.');
  }
  activate(n: SceneNode) {
    if (n.targetId) {
      this.previewHistory.push(this.preview()!);
      this.preview.set(n.targetId);
    }
  }
  preset(width: number) {
    if (this.e.node()?.kind === 'artboard') this.e.update({ width });
    else this.e.error.set('Select an artboard to apply a viewport preset.');
  }
  repeat() {
    const n = this.e.node();
    if (!n) return;
    const result = this.e.perform([{ type: 'repeat.create', id: n.id, count: 6, columns: 3 }]);
    if (result) this.e.select(result.ids[0]);
  }
  makeComponent() {
    const n = this.e.node();
    if (n) this.e.perform([{ type: 'component.create', id: n.id }]);
  }
  insertComponent(id: string) {
    const result = this.e.perform([
      { type: 'component.insert', id, pageId: this.e.pageId(), x: 80, y: 80 },
    ]);
    if (result) this.e.select(result.ids[0]);
  }
  populate(value: string) {
    try {
      const values = JSON.parse(value);
      this.e.perform([{ type: 'repeat.populate', id: this.e.selected()!, values }]);
    } catch (e) {
      this.e.report(e);
    }
  }
  duplicate() {
    const n = this.e.node();
    if (!n) return;
    const nodes = cloneTree(this.e.doc(), n.id, {
      pageId: n.pageId,
      parentId: n.parentId,
      x: n.x + 24,
      y: n.y + 24,
      linked: false,
    });
    const result = this.e.perform(nodes.map((node) => ({ type: 'node.add', node })));
    if (result) this.e.select(result.ids[0]);
  }
  async importTokens(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) await this.e.loadTokens(file);
  }
  async importImage(event: Event) {
    const f = (event.target as HTMLInputElement).files?.[0];
    if (f) await this.e.image(f);
  }
  @HostListener('window:keydown', ['$event']) key(event: KeyboardEvent) {
    const typing = (event.target as HTMLElement).matches('input,textarea,select,[contenteditable]');
    if (event.key === 'Escape') {
      this.preview.set(null);
      this.e.select(null);
      return;
    }
    if (event.metaKey || event.ctrlKey) {
      if (event.key === 's') {
        event.preventDefault();
        this.e.save(event.shiftKey);
      }
      if (typing) return;
      if (event.key === 'z') {
        event.preventDefault();
        event.shiftKey ? this.e.redo() : this.e.undo();
      }
      if (event.key === 'c') {
        event.preventDefault();
        this.e.copy('editable');
      }
      if (event.key === 'v') {
        event.preventDefault();
        this.e.paste();
      }
      if (event.key === 'd') {
        event.preventDefault();
        this.duplicate();
      }
      return;
    }
    if (typing || this.preview() || this.e.mode() !== 'Design') return;
    if (
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) &&
      this.e.node() &&
      !this.e.node()!.locked
    ) {
      event.preventDefault();
      const n = this.e.node()!,
        step = event.shiftKey ? 10 : 1;
      const nodes = this.e.selectedRoots().filter((n) => this.canMove(n));
      if (nodes.length)
        this.e.perform(
          nodes.map((n) => ({
            type: 'node.update',
            id: n.id,
            patch: {
              x: n.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0),
              y: n.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0),
            },
          })),
        );
    }
    if (event.key === 'Backspace' || event.key === 'Delete') this.e.remove();
    if (event.key === 'f') this.e.add('artboard');
    if (event.key === 'r') this.e.add('rectangle');
    if (event.key === 't') this.e.add('text');
    if (['1', '2', '3'].includes(event.key)) this.e.mode.set(this.modes[+event.key - 1]);
  }
}
