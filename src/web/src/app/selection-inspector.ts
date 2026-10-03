import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EditorService } from './editor.service';
import { CanvasProjection } from './canvas/canvas-projection';
import { boxIn, union, translation } from './canvas/placement-geometry';
import type { SceneNode } from './model/schema';

const textKinds = ['text', 'button', 'input'];
interface Field {
  key: Key;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  text?: boolean;
  kinds?: readonly string[];
}
const fields = [
  { key: 'width', label: 'Width', min: 1 },
  { key: 'height', label: 'Height', min: 1 },
  { key: 'rotation', label: 'Rotation' },
  { key: 'opacity', label: 'Opacity', min: 0, max: 1, step: 0.01 },
  {
    key: 'fill',
    label: 'Fill',
    text: true,
    kinds: ['artboard', 'frame', 'rectangle', 'ellipse', 'button', 'input'],
  },
  {
    key: 'strokeWidth',
    label: 'Border width',
    min: 0,
    kinds: ['artboard', 'frame', 'rectangle', 'ellipse', 'button', 'input', 'path'],
  },
  {
    key: 'stroke',
    label: 'Border color',
    text: true,
    kinds: ['artboard', 'frame', 'rectangle', 'ellipse', 'button', 'input', 'path'],
  },
  { key: 'fontSize', label: 'Font size', min: 6, kinds: textKinds },
  { key: 'fontWeight', label: 'Font weight', min: 100, max: 900, step: 100, kinds: textKinds },
  { key: 'lineHeight', label: 'Line height', min: 0.5, max: 5, step: 0.1, kinds: textKinds },
  {
    key: 'letterSpacing',
    label: 'Letter spacing',
    min: -20,
    max: 100,
    step: 0.1,
    kinds: textKinds,
  },
  { key: 'color', label: 'Text color', text: true, kinds: textKinds },
] as const;
type Key = (typeof fields)[number]['key'];
@Component({
  selector: 'selection-inspector',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './selection-inspector.html',
  styleUrl: './selection-inspector.scss',
})
export class SelectionInspector {
  readonly axes = ['x', 'y'] as const;
  readonly e = inject(EditorService);
  readonly projection = inject(CanvasProjection);
  readonly roots = computed(() => this.e.selectedRoots());
  readonly editable = computed(
    () =>
      this.e.mode() === 'Design' &&
      this.roots().length > 0 &&
      this.roots().every((n) => this.projection.canEdit(n)),
  );
  readonly movable = computed(
    () => this.editable() && this.roots().every((n) => this.projection.canMove(n)),
  );
  readonly items = computed(() =>
    this.roots().flatMap((n) => {
      const item = this.projection.byId().get(n.id);
      return item ? [item] : [];
    }),
  );
  readonly bounds = computed(() =>
    this.items().length ? union(this.items().map((item) => boxIn(item))) : null,
  );
  readonly fields = computed(() =>
    (fields as readonly Field[]).filter(
      (field) =>
        !field.kinds ||
        this.roots().every((n) => (field.kinds as readonly string[]).includes(n.kind)),
    ),
  );
  readonly kinds = computed(() => [...new Set(this.roots().map((n) => n.kind))].join(', '));
  shared(key: Key): string | number | null {
    const nodes = this.roots(),
      value = nodes[0]?.[key];
    return nodes.length && nodes.every((n) => n[key] === value) ? (value as string | number) : null;
  }
  disabled(key: Key) {
    return (
      !this.editable() ||
      (key === 'width' && this.roots().some((n) => n.widthMode !== 'fixed')) ||
      (key === 'height' && this.roots().some((n) => n.heightMode !== 'fixed'))
    );
  }
  patch(key: Key, event: Event) {
    if (this.disabled(key)) return;
    const field = fields.find((f) => f.key === key)!;
    const raw = (event.target as HTMLInputElement).value;
    if (!raw.trim()) return;
    const value = 'text' in field ? raw : Number(raw);
    if (typeof value === 'number' && !Number.isFinite(value)) return;
    this.e.perform(
      this.roots().map((n) => ({
        type: 'node.update',
        id: n.id,
        patch: { [key]: value } as Partial<SceneNode>,
      })),
    );
  }
  move(axis: 'x' | 'y', event: Event) {
    if (!this.movable() || this.items().length !== this.roots().length) return;
    const raw = (event.target as HTMLInputElement).value,
      value = Number(raw),
      bounds = this.bounds();
    if (!raw.trim() || !Number.isFinite(value) || !bounds) return;
    const delta = value - bounds[axis];
    const updates = translation(this.items(), axis === 'x' ? delta : 0, axis === 'y' ? delta : 0);
    if (!updates) {
      this.e.error.set('Selection movement would exceed document coordinate limits.');
      return;
    }
    if (updates.length)
      this.e.perform(updates.map((update) => ({ type: 'node.update', ...update })));
  }
}
