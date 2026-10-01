import { Injectable, computed, effect, inject, signal, untracked, OnDestroy } from '@angular/core';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { EditorService } from '../editor.service';
import { flatten, project } from './scene-layout';
import type { SceneNode } from '../model/schema';
@Injectable({ providedIn: 'root' })
export class CanvasProjection implements OnDestroy {
  readonly e = inject(EditorService);
  readonly assets = this.e.assets;
  readonly draft = signal<Record<string, Partial<SceneNode>>>({});
  readonly size = signal({ width: 1000, height: 800 });
  readonly stats = signal({ drawn: 0, total: 0, paintMs: 0, frames: 0 });
  private readonly measureContext = document.createElement('canvas').getContext('2d')!;
  private readonly measures = new Map<string, number>();
  private readonly fontsVersion = signal(0);
  readonly document = computed(() => ({
    ...this.e.doc(),
    nodes: this.e.doc().nodes.map((n) => ({ ...n, ...this.draft()[n.id] })),
  }));
  readonly roots = computed(() => {
    this.fontsVersion();
    return project(
      this.document(),
      this.e.pageId(),
      (text, n) => this.measure(text, n),
      this.size(),
    );
  });
  readonly items = computed(() => flatten(this.roots()));
  readonly byId = computed(() => new Map(this.items().map((i) => [i.node.id, i])));
  private readonly authoredNodes = computed(() => new Map(this.e.doc().nodes.map((n) => [n.id, n])));
  readonly ydoc = new Y.Doc();
  readonly board = {
    ydoc: this.ydoc,
    awareness: new Awareness(this.ydoc),
    metadata: this.ydoc.getMap<unknown>('projection'),
    layers: this.ydoc.getArray<Y.Map<unknown>>('layers'),
    elements: this.ydoc.getMap<Y.Map<unknown>>('elements'),
  };
  private version = 0;
  constructor() {
    effect(() => {
      this.roots();
      this.e.selection();
      this.e.mode();
      this.assets.version();
      untracked(() => this.board.metadata.set('version', ++this.version));
    });
    effect(() => {
      this.e.revision();
      this.e.doc().id;
      untracked(() => this.draft.set({}));
    });
    document.fonts.addEventListener('loadingdone', this.fontsChanged);
  }
  private readonly fontsChanged = () => {
    this.measures.clear();
    this.fontsVersion.update((v) => v + 1);
  };
  private measure(text: string, node: SceneNode) {
    const key = `${node.fontWeight}/${node.fontSize}/${text}`;
    const known = this.measures.get(key);
    if (known !== undefined) return known;
    this.measureContext.font = `${node.fontWeight} ${node.fontSize}px system-ui, sans-serif`;
    const width = this.measureContext.measureText(text).width;
    if (this.measures.size > 5000) this.measures.clear();
    this.measures.set(key, width);
    return width;
  }
  canMove(node: SceneNode) {
    if (node.locked) return false;
    const nodes = this.authoredNodes();
    let parent = nodes.get(node.parentId ?? '');
    if (parent && parent.layout !== 'free') return false;
    while (parent) {
      if (parent.rotation) return false;
      parent = nodes.get(parent.parentId ?? '');
    }
    return true;
  }
  canResize(node: SceneNode) {
    return (
      this.canMove(node) &&
      node.rotation === 0 &&
      node.widthMode === 'fixed' &&
      node.heightMode === 'fixed'
    );
  }
  ngOnDestroy() {
    document.fonts.removeEventListener('loadingdone', this.fontsChanged);
    this.board.awareness.destroy();
    this.ydoc.destroy();
  }
}
