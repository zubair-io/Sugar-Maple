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
    return n ? { ...n, x: 0, y: 0 } : null;
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
  private gesture: {
    id?: string;
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
  value(event: Event) {
    return (event.target as HTMLInputElement).value;
  }
  patch(key: string, value: any) {
    this.e.update({ [key]: value });
  }
  addPage() {
    const r = this.e.perform([
      { type: 'page.add', name: 'Page ' + (this.e.doc().pages.length + 1) },
    ]);
    if (r) this.e.pageId.set(r.ids[0]);
  }
  selectPage(id: string) {
    this.e.pageId.set(id);
    this.e.selected.set(null);
  }
  pick({ event, node }: { event: PointerEvent; node: SceneNode }) {
    event.stopPropagation();
    if (event.button !== 0 || node.locked) return;
    this.e.selected.set(node.id);
    if (this.e.mode() !== 'Design') return;
    const parent = this.e.doc().nodes.find((n) => n.id === node.parentId);
    if (parent && parent.layout !== 'free') return;
    this.gesture = {
      id: node.id,
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
    } else this.e.selected.set(null);
  }
  @HostListener('window:pointermove', ['$event']) move(event: PointerEvent) {
    const g = this.gesture;
    if (!g) return;
    const dx = event.clientX - g.startX,
      dy = event.clientY - g.startY;
    if (g.pan) {
      this.pan.set({ x: g.x + dx, y: g.y + dy });
      return;
    }
    if (!g.element) return;
    if (g.resize) {
      g.element.style.width = Math.max(1, g.width! + dx / this.zoom()) + 'px';
      g.element.style.height = Math.max(1, g.height! + dy / this.zoom()) + 'px';
    } else {
      g.element.style.left = g.x + dx / this.zoom() + 'px';
      g.element.style.top = g.y + dy / this.zoom() + 'px';
    }
  }
  @HostListener('window:pointerup', ['$event']) end(event: PointerEvent) {
    const g = this.gesture;
    this.gesture = null;
    if (!g?.id) return;
    const dx = (event.clientX - g.startX) / this.zoom(),
      dy = (event.clientY - g.startY) / this.zoom();
    if (Math.abs(dx) + Math.abs(dy) < 1) return;
    this.e.perform([
      {
        type: 'node.update',
        id: g.id,
        patch: g.resize
          ? { width: Math.max(1, g.width! + dx), height: Math.max(1, g.height! + dy) }
          : { x: g.x + dx, y: g.y + dy },
      },
    ]);
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
  startPreview() {
    const n = this.e.node();
    const board = n?.kind === 'artboard' ? n : this.e.roots().find((n) => n.kind === 'artboard');
    if (board) {
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
    if (result) this.e.selected.set(result.ids[0]);
  }
  makeComponent() {
    const n = this.e.node();
    if (n) this.e.perform([{ type: 'component.create', id: n.id }]);
  }
  insertComponent(id: string) {
    const result = this.e.perform([
      { type: 'component.insert', id, pageId: this.e.pageId(), x: 80, y: 80 },
    ]);
    if (result) this.e.selected.set(result.ids[0]);
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
    if (result) this.e.selected.set(result.ids[0]);
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
      this.e.selected.set(null);
      return;
    }
    if (event.metaKey || event.ctrlKey) {
      if (event.key === 's') {
        event.preventDefault();
        this.e.save();
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
    if (typing || this.preview()) return;
    if (event.key === 'Backspace' || event.key === 'Delete') this.e.remove();
    if (event.key === 'f') this.e.add('artboard');
    if (event.key === 'r') this.e.add('rectangle');
    if (event.key === 't') this.e.add('text');
    if (['1', '2', '3'].includes(event.key)) this.e.mode.set(this.modes[+event.key - 1]);
  }
}
