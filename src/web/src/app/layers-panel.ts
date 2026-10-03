import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type { SceneNode } from './model/schema';
import type { MapleIconName } from './chrome/maple/sugar-maple-chrome';
import { EditorService } from './editor.service';
import { MuiTreeRowComponent } from './chrome/maple/sugar-maple-chrome';
import { layerRows } from './model/layers';
import { LAYER_ROW_HEIGHT, layerWindow } from './layers-window';

@Component({
  selector: 'layers-panel',
  imports: [MuiTreeRowComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      #viewport
      class="layers-viewport"
      role="tree"
      aria-label="Layers"
      aria-multiselectable="true"
      [attr.data-layer-count]="rows().length"
      (scroll)="scrolled()"
      (focusout)="releasedFocus()"
      (keydown)="navigate($event)"
    >
      <div class="layers-space" [style.height.px]="rows().length * rowHeight">
        @for (entry of mounted(); track entry.row.node.id) {
          @let row = entry.row;
          @let node = row.node;
          <div
            class="layer-row"
            [style.top.px]="entry.index * rowHeight"
            (focusin)="holdFocus(node.id)"
          >
            <mui-tree-row
              [attr.data-layer-id]="node.id"
              [tabIndex]="tabStop() === node.id ? 0 : -1"
              [label]="node.name"
              [ariaLabel]="'Select ' + node.name"
              [depth]="row.depth"
              [positionInSet]="row.position"
              [setSize]="row.size"
              [icon]="icon(node)"
              [expandable]="parents().has(node.id)"
              [expanded]="!!search().trim() || !collapsed().has(node.id)"
              (expandedChange)="expand(node.id, $event)"
              iconColor="active-only"
              [active]="selection().has(node.id)"
              (activated)="e.select(node.id, $event.shiftKey)"
            />
            <button
              [attr.aria-label]="(node.hidden ? 'Show ' : 'Hide ') + node.name"
              [title]="(node.hidden ? 'Show ' : 'Hide ') + node.name"
              [disabled]="e.mode() !== 'Design'"
              (click)="toggle(node, 'hidden')"
            >
              {{ node.hidden ? '○' : '◉' }}
            </button>
            <button
              [attr.aria-label]="(node.locked ? 'Unlock ' : 'Lock ') + node.name"
              [title]="(node.locked ? 'Unlock ' : 'Lock ') + node.name"
              [disabled]="e.mode() !== 'Design'"
              (click)="toggle(node, 'locked')"
            >
              {{ node.locked ? '▣' : '▫' }}
            </button>
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex: 1;
      min-height: 120px;
    }
    .layers-viewport {
      flex: 1;
      min-width: 0;
      overflow: auto;
      position: relative;
      overflow-anchor: none;
    }
    .layers-space {
      position: relative;
    }
    .layer-row {
      position: absolute;
      left: 0;
      right: 0;
      height: 36px;
      display: flex;
      align-items: center;
      padding: 0 8px;
      box-sizing: border-box;
    }
    mui-tree-row {
      flex: 1;
      min-width: 0;
    }
    button {
      flex: 0 0 28px;
      border: 0;
      border-radius: 3px;
      padding: 3px;
      background: transparent;
      color: var(--color-text-muted);
      font: inherit;
      font-size: 10px;
      cursor: pointer;
    }
    button:hover {
      background: var(--color-surface-hover);
    }
    button:focus-visible {
      outline: 2px solid var(--color-primary);
      outline-offset: -2px;
    }
  `,
})
export class LayersPanel {
  readonly e = inject(EditorService);
  private readonly injector = inject(Injector);
  private focusRequest = 0;
  readonly search = input('');
  readonly rowHeight = LAYER_ROW_HEIGHT;
  readonly collapsed = signal<ReadonlySet<string>>(new Set());
  readonly parents = computed(
    () =>
      new Set(
        this.e
          .pageNodes()
          .map((n) => n.parentId)
          .filter(Boolean),
      ),
  );
  private readonly context = computed(() => this.e.doc().id + ':' + this.e.pageId());
  readonly rows = computed(() => layerRows(this.e.pageNodes(), this.search(), this.collapsed()));
  icon(node: SceneNode): MapleIconName {
    if (node.isComponent || node.componentId) return 'grid-sm';
    if (node.kind === 'image') return 'photos';
    if (node.kind === 'path') return 'edit';
    return ('design-' + node.kind) as MapleIconName;
  }
  expand(id: string, expanded: boolean) {
    if (this.search().trim()) return;
    this.collapsed.update((current) => {
      const next = new Set(current);
      if (expanded) next.delete(id);
      else next.add(id);
      return next;
    });
    this.focused.set(id);
  }
  toggle(node: SceneNode, key: 'hidden' | 'locked') {
    if (this.e.mode() === 'Design')
      this.e.perform([{ type: 'node.update', id: node.id, patch: { [key]: !node[key] } }]);
  }

  readonly indices = computed(() => new Map(this.rows().map((row, index) => [row.node.id, index])));
  readonly selection = computed(() => new Set(this.e.selection()));
  readonly focused = signal<string | null>(null);
  readonly held = signal<string | null>(null);
  readonly top = signal(0);
  readonly height = signal(0);
  readonly viewport = viewChild<ElementRef<HTMLDivElement>>('viewport');
  readonly tabStop = computed(() => {
    const indices = this.indices();
    return (
      (this.focused() && indices.has(this.focused()!) ? this.focused() : null) ??
      this.e.selection().find((id) => indices.has(id)) ??
      this.rows()[0]?.node.id
    );
  });
  readonly mounted = computed(() => {
    const indices = this.indices(),
      rows = this.rows();
    return layerWindow(rows.length, this.top(), this.height(), [
      indices.get(this.held() ?? '') ?? -1,
      indices.get(this.tabStop() ?? '') ?? -1,
    ]).map((index) => ({ row: rows[index], index }));
  });
  constructor() {
    effect(() => {
      this.context();
      untracked(() => this.collapsed.set(new Set()));
    });

    effect((onCleanup) => {
      const element = this.viewport()?.nativeElement;
      if (!element) return;
      const resize = new ResizeObserver(() => {
        this.height.set(element.clientHeight);
        this.scrolled();
      });
      resize.observe(element);
      onCleanup(() => resize.disconnect());
    });
    effect(() => {
      this.search();
      this.e.pageId();
      untracked(() => this.scrollTo(0));
    });
    effect(() => {
      const id = this.e.selected();
      this.e.pageId();
      untracked(() => {
        if (!id) return;
        const byId = new Map(this.e.pageNodes().map((n) => [n.id, n]));
        const ancestors = new Set<string>();
        let parent = byId.get(id)?.parentId;
        while (parent && byId.has(parent)) {
          ancestors.add(parent);
          parent = byId.get(parent)?.parentId;
        }
        this.collapsed.update(
          (current) => new Set([...current].filter((value) => !ancestors.has(value))),
        );
        this.reveal(id);
      });
    });
    effect(() => {
      this.height();
      untracked(() => {
        const target = this.held() ?? this.e.selected();
        if (target) this.reveal(target);
      });
    });
    effect(() => {
      const rows = this.rows();
      untracked(() => {
        this.scrollTo(
          Math.min(this.top(), Math.max(0, rows.length * this.rowHeight - this.height())),
        );
      });
    });
  }
  scrolled(): void {
    this.top.set(this.viewport()?.nativeElement.scrollTop ?? 0);
  }
  private scrollTo(top: number): void {
    const element = this.viewport()?.nativeElement;
    if (element) {
      element.scrollTop = top;
      this.top.set(element.scrollTop);
    }
  }
  private reveal(id: string): void {
    const index = this.indices().get(id);
    if (index === undefined) return;
    const top = index * this.rowHeight;
    if (top < this.top()) this.scrollTo(top);
    else if (top + this.rowHeight > this.top() + this.height())
      this.scrollTo(top + this.rowHeight - this.height());
  }
  holdFocus(id: string): void {
    this.focusRequest++;
    this.held.set(id);
    this.focused.set(id);
    this.reveal(id);
  }
  releasedFocus(): void {
    queueMicrotask(() => {
      if (!this.viewport()?.nativeElement.contains(document.activeElement)) this.held.set(null);
    });
  }
  navigate(event: KeyboardEvent): void {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
      return;
    // Auxiliary layer controls must not bubble arrow keys into Canvas nudging.
    event.stopPropagation();
    if (!(event.target instanceof HTMLElement) || event.target.getAttribute('role') !== 'treeitem')
      return;
    const id = event.target.closest('[data-layer-id]')?.getAttribute('data-layer-id');
    if (!id) return;
    event.preventDefault();
    event.stopPropagation();
    // Key repeats can arrive before the pending render transfers DOM focus.
    const rows = this.rows(),
      index = this.indices().get(this.focused() ?? id);
    if (index === undefined) return;
    let next = index;
    if (event.key === 'ArrowUp') next = Math.max(0, index - 1);
    if (event.key === 'ArrowDown') next = Math.min(rows.length - 1, index + 1);
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = rows.length - 1;
    const currentId = rows[index].node.id;
    if (event.key === 'ArrowLeft') {
      if (
        this.parents().has(currentId) &&
        !this.collapsed().has(currentId) &&
        !this.search().trim()
      )
        this.expand(currentId, false);
      else next = this.indices().get(rows[index].node.parentId ?? '') ?? index;
    }
    if (event.key === 'ArrowRight') {
      if (this.parents().has(currentId) && this.collapsed().has(currentId) && !this.search().trim())
        this.expand(currentId, true);
      else if (rows[index + 1]?.node.parentId === currentId) next = index + 1;
    }
    const target = rows[next].node.id;
    const request = ++this.focusRequest;
    this.focused.set(target);
    this.reveal(target);
    afterNextRender(
      () => {
        if (request !== this.focusRequest) return;
        this.viewport()
          ?.nativeElement.querySelector<HTMLElement>(
            `[data-layer-id="${CSS.escape(target)}"] [role="treeitem"]`,
          )
          ?.focus({ preventScroll: true });
      },
      { injector: this.injector },
    );
  }
}
