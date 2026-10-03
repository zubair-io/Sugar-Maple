import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { EditorService } from './editor.service';
import { CanvasProjection } from './canvas/canvas-projection';
import { MuiSelectComponent } from './chrome/maple/ui/select/mui-select.component';
import { MuiFieldComponent } from './chrome/maple/ui/field/mui-field.component';
import type { SceneNode } from './model/schema';
type Action = SceneNode['prototypeAction'];
const actions = ['navigate', 'openOverlay', 'closeOverlay', 'back'] as const;
@Component({
  selector: 'prototype-inspector',
  standalone: true,
  imports: [MuiFieldComponent, MuiSelectComponent],
  templateUrl: './prototype-inspector.html',
  styleUrl: './prototype-inspector.scss',
})
export class PrototypeInspector {
  readonly e = inject(EditorService);
  readonly projection = inject(CanvasProjection);
  readonly node = input.required<SceneNode>();
  readonly pending = signal<Action | null>(null);
  readonly action = computed(() => this.pending() ?? this.node().prototypeAction);
  readonly requiresTarget = computed(() => ['navigate', 'openOverlay'].includes(this.action()));
  readonly editable = computed(
    () => this.e.mode() === 'Prototype' && this.projection.canEdit(this.node()),
  );
  readonly targets = computed(() => [
    { value: '', label: 'Choose an artboard' },
    ...this.e
      .doc()
      .nodes.filter((n) => n.kind === 'artboard')
      .map((n) => ({
        value: n.id,
        label: `${this.e.doc().pages.find((p) => p.id === n.pageId)?.name} / ${n.name}`,
        disabled: n.hidden,
      })),
  ]);
  readonly validTarget = computed(() =>
    this.e
      .doc()
      .nodes.some((n) => n.id === this.node().targetId && n.kind === 'artboard' && !n.hidden),
  );
  readonly configured = computed(
    () => !!this.node().targetId || this.node().prototypeAction !== 'navigate',
  );
  readonly actionOptions = [
    { value: 'navigate', label: 'Navigate' },
    { value: 'openOverlay', label: 'Open overlay' },
    { value: 'closeOverlay', label: 'Close overlay' },
    { value: 'back', label: 'Back' },
  ];
  readonly transitions = [
    { value: 'instant', label: 'Instant' },
    { value: 'dissolve', label: 'Dissolve' },
  ];
  constructor() {
    effect(() => {
      this.node();
      this.pending.set(null);
    });
  }
  setAction(value: string) {
    if (!this.editable() || !actions.includes(value as Action)) return;
    const action = value as Action;
    if (['navigate', 'openOverlay'].includes(action) && !this.validTarget()) {
      this.pending.set(action);
      return;
    }
    if (
      this.e.perform([
        { type: 'node.update', id: this.node().id, patch: { prototypeAction: action } },
      ])
    )
      this.pending.set(null);
  }
  setTarget(id: string) {
    if (!this.editable() || !this.requiresTarget()) return;
    if (!this.e.doc().nodes.some((n) => n.id === id && n.kind === 'artboard' && !n.hidden)) {
      this.e.error.set('Choose a visible artboard as the interaction destination.');
      return;
    }
    if (
      this.e.perform([
        {
          type: 'node.update',
          id: this.node().id,
          patch: { prototypeAction: this.action(), targetId: id },
        },
      ])
    )
      this.pending.set(null);
  }
  setTransition(value: string) {
    if (
      this.editable() &&
      this.requiresTarget() &&
      this.validTarget() &&
      ['instant', 'dissolve'].includes(value)
    )
      this.e.perform([
        {
          type: 'node.update',
          id: this.node().id,
          patch: { transition: value as SceneNode['transition'] },
        },
      ]);
  }
  clear() {
    if (this.editable())
      this.e.perform([
        {
          type: 'node.update',
          id: this.node().id,
          patch: { prototypeAction: 'navigate', targetId: null },
        },
      ]);
  }
}
