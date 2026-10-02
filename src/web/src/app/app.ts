import { RepeatInspector } from './canvas/repeat-inspector';
import { FontInspector } from './canvas/font-inspector';
import { EditorHeader } from './editor-header';
import { MuiSelectComponent } from './chrome/maple/ui/select/mui-select.component';
import { CommentUi } from './comments/comment-ui';
import { CommentCanvas } from './comments/comment-canvas';
import { CommentsPanel } from './comments/comments-panel';
import { cloneTree } from './model/composition';
import {
  Component,
  inject,
  signal,
  computed,
  effect,
  HostListener,
  viewChild,
} from '@angular/core';
import { KeyValuePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EditorService } from './editor.service';
import { PrototypePreview } from './canvas/prototype-preview';
import { CanvasSurface } from './canvas/canvas-surface';
import { CanvasProjection } from './canvas/canvas-projection';
import { AssetInspector } from './canvas/asset-inspector';
import { intersects } from './canvas/scene-layout';
import { MuiButtonComponent } from './chrome/maple/ui/button/mui-button.component';
import { MuiSectionComponent } from './chrome/maple/ui/section/mui-section.component';
import { MuiFieldComponent } from './chrome/maple/ui/field/mui-field.component';
import { SceneNode, uid, Operation } from './model/schema';
import { exportNode, ExportTarget } from './model/export';
import { LayersPanel } from './layers-panel';
import {
  MuiInputComponent,
  MuiToolbarComponent,
  MuiInspectorPanelComponent,
  type MuiToolbarEntry,
  type MapleIconName,
} from './chrome/maple/sugar-maple-chrome';
import { ChromeTheme } from './chrome/maple/sugar-maple-chrome-theme';
@Component({
  selector: 'app-root',
  imports: [
    EditorHeader,
    CommentCanvas,
    MuiSelectComponent,
    CommentsPanel,
    KeyValuePipe,
    FormsModule,
    PrototypePreview,
    CanvasSurface,
    AssetInspector,
    RepeatInspector,
    FontInspector,
    MuiButtonComponent,
    MuiSectionComponent,
    MuiFieldComponent,
    MuiInputComponent,
    MuiToolbarComponent,
    LayersPanel,
    MuiInspectorPanelComponent,
  ],
  host: { '[attr.data-chrome-theme]': 'theme.appearance()' },
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  readonly repeatTemplateIds = computed(
    () =>
      new Set(this.e.doc().nodes.flatMap((n) => (n.repeatTemplateId ? [n.repeatTemplateId] : []))),
  );
  readonly repeatParent = computed(
    () => this.e.doc().nodes.find((n) => n.repeatTemplateId === this.e.selected()) ?? null,
  );
  readonly Math = Math;
  readonly e = inject(EditorService);
  readonly theme = inject(ChromeTheme);
  readonly inspectorTabs = [
    { id: 'Details', label: 'Details' },
    { id: 'Comments', label: 'Comments' },
  ];
  readonly creationTools = computed<readonly MuiToolbarEntry[]>(() =>
    this.kinds.map((kind) => ({
      id: kind,
      label: 'Add ' + kind,
      icon: ('design-' + kind) as MapleIconName,
      iconOnly: true,
      disabled: this.e.mode() !== 'Design',
    })),
  );
  createFromToolbar(id: string): void {
    const kind = this.kinds.find((kind) => kind === id);
    if (kind && this.e.mode() === 'Design') this.e.add(kind);
  }
  readonly projection = inject(CanvasProjection);
  readonly surface = viewChild(CanvasSurface);
  readonly zoom = signal(0.8);
  readonly pan = signal({ x: 0, y: 0 });
  readonly tab = signal('Pages');
  readonly currentPageName = computed(
    () => this.e.doc().pages.find((p) => p.id === this.e.pageId())?.name ?? 'Page',
  );
  options(values: readonly string[]) {
    return values.map((value) => ({ value, label: value }));
  }
  readonly folderSelectOptions = computed(() => [
    { value: '', label: 'No folder' },
    ...this.e.doc().folders.map((f) => ({ value: f.id, label: f.name })),
  ]);
  readonly parentSelectOptions = computed(() => [
    { value: '', label: 'Page root' },
    ...this.parentOptions().map((n) => ({ value: n.id, label: n.name })),
  ]);
  readonly tokenSelectOptions = computed(() => [
    { value: '', label: 'Literal color' },
    ...this.options(Object.keys(this.e.doc().tokens)),
  ]);
  readonly variantSelectOptions = computed(() =>
    this.options(['Default', ...Object.keys(this.master()?.variants ?? {})]),
  );
  readonly linkSelectOptions = computed(() => [
    { value: '', label: 'No action' },
    ...this.e
      .doc()
      .nodes.filter((n) => n.kind === 'artboard')
      .map((n) => ({
        value: n.id,
        label: `${this.e.doc().pages.find((p) => p.id === n.pageId)?.name} / ${n.name}`,
      })),
  ]);
  readonly inputTypeOptions = this.options(['text', 'password', 'email']);
  readonly actionOptions = [
    { value: 'navigate', label: 'Navigate' },
    { value: 'openOverlay', label: 'Open overlay' },
    { value: 'closeOverlay', label: 'Close overlay' },
    { value: 'back', label: 'Back' },
  ];
  readonly transitionOptions = this.options(['instant', 'dissolve']);
  readonly layoutOptions = this.options(['free', 'horizontal', 'vertical', 'grid']);
  readonly textAlignOptions = this.options(['auto', 'left', 'center', 'right']);
  readonly sizingOptions = this.options(['fixed', 'fill', 'hug', 'percent']);
  readonly fillStyleOptions = [
    { value: 'solid', label: 'Solid' },
    { value: 'linear', label: 'Linear gradient' },
    { value: 'radial', label: 'Radial gradient' },
  ];
  readonly target = signal<ExportTarget>('html');
  readonly preview = signal<string | null>(null);

  readonly search = signal('');

  readonly left = signal(true);
  readonly right = signal(true);
  readonly commentUi = inject(CommentUi);

  readonly code = computed(() => {
    try {
      return this.e.selected() ? exportNode(this.e.doc(), this.e.selected()!, this.target()) : '';
    } catch (error) {
      return 'Unsupported export: ' + (error instanceof Error ? error.message : String(error));
    }
  });
  readonly master = computed(() =>
    this.e.doc().nodes.find((n) => n.id === this.e.node()?.componentId && n.isComponent),
  );
  readonly parentOptions = computed(() =>
    this.e
      .pageNodes()
      .filter((n) => ['artboard', 'frame'].includes(n.kind) && n.id !== this.e.selected()),
  );
  readonly transformFields = [
    { key: 'x', label: 'X', name: 'X position' },
    { key: 'y', label: 'Y', name: 'Y position' },
    { key: 'width', label: 'W', name: 'Width' },
    { key: 'height', label: 'H', name: 'Height' },
    { key: 'rotation', label: '°', name: 'Rotation' },
  ] as const;
  readonly alignmentActions = [
    { key: 'left', label: 'Align left', glyph: 'L' },
    { key: 'center', label: 'Align horizontal center', glyph: 'C' },
    { key: 'right', label: 'Align right', glyph: 'R' },
    { key: 'top', label: 'Align top', glyph: 'T' },
    { key: 'middle', label: 'Align vertical middle', glyph: 'M' },
    { key: 'bottom', label: 'Align bottom', glyph: 'B' },
  ] as const;
  readonly managedByParent = computed(() => {
    const parent = this.e.doc().nodes.find((node) => node.id === this.e.node()?.parentId);
    return !!parent && parent.layout !== 'free';
  });
  readonly canAlign = computed(() => {
    const nodes = this.e.selectedRoots();
    if (
      !nodes.length ||
      nodes.some(
        (node) =>
          node.locked ||
          node.rotation !== 0 ||
          node.widthMode !== 'fixed' ||
          node.heightMode !== 'fixed',
      )
    )
      return false;
    if (nodes.some((node) => node.parentId !== nodes[0].parentId)) return false;
    const parent = this.e.doc().nodes.find((node) => node.id === nodes[0].parentId);
    return nodes.length > 1
      ? !parent || parent.layout === 'free'
      : !!parent && parent.layout === 'free';
  });
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
  readonly exportOptions = this.options(this.targets);
  readonly modes = ['Design', 'Prototype', 'Developer'] as const;
  constructor() {
    effect(() => {
      if (this.commentUi.openRequest()) this.right.set(true);
    });
    window.sugarMaple.viewport = {
      flush: () => this.surface()?.flush(),
      inspect: () => this.inspectCanvas(),
      stats: () => this.projection.stats(),
      camera: () => ({ zoom: this.zoom(), pan: this.pan() }),
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
  readonly collapsedFolders = signal<string[]>([]);
  readonly currentFolder = computed(
    () => this.e.doc().pages.find((p) => p.id === this.e.pageId())?.folderId ?? null,
  );
  readonly pageRows = computed(() => {
    const doc = this.e.doc();
    return [
      ...doc.pages
        .filter((p) => !p.folderId)
        .map((p) => ({ kind: 'page', id: p.id, name: p.name, folderId: null })),
      ...doc.folders.flatMap((f) => [
        { kind: 'folder', id: f.id, name: f.name, folderId: null },
        ...(this.collapsedFolders().includes(f.id)
          ? []
          : doc.pages
              .filter((p) => p.folderId === f.id)
              .map((p) => ({ kind: 'page', id: p.id, name: p.name, folderId: p.folderId }))),
      ]),
    ];
  });
  toggleFolder(id: string) {
    this.collapsedFolders.update((ids) =>
      ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id],
    );
  }
  createFolder(name: string) {
    if (name.trim()) this.e.perform([{ type: 'folder.add', name: name.trim() }]);
  }
  renameFolder(id: string, event: Event) {
    const input = event.target as HTMLInputElement;
    const name = input.value.trim();
    if (name) this.e.perform([{ type: 'folder.update', id, name }]);
    input.value = this.e.doc().folders.find((folder) => folder.id === id)?.name ?? '';
  }
  movePage(folderId: string) {
    this.e.perform([{ type: 'page.update', id: this.e.pageId(), folderId: folderId || null }]);
    this.collapsedFolders.update((ids) => ids.filter((v) => v !== folderId));
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
      {
        type: 'page.add',
        name: 'Page ' + (this.e.doc().pages.length + 1),
        folderId: this.currentFolder(),
      },
    ]);
    if (r) {
      this.e.pageId.set(r.ids[0]);
      this.collapsedFolders.update((ids) => ids.filter((id) => id !== this.currentFolder()));
    }
  }
  selectPage(id: string) {
    this.e.pageId.set(id);
    this.e.select(null);
  }
  canMove(n: SceneNode) {
    return this.projection.canMove(n);
  }
  inspectCanvas() {
    const viewport = document.querySelector('.viewport')!.getBoundingClientRect();
    const zoom = this.zoom(),
      pan = this.pan(),
      index = this.projection.byId();
    const view = {
      x: -pan.x / zoom,
      y: -pan.y / zoom,
      width: viewport.width / zoom,
      height: viewport.height / zoom,
    };
    return {
      documentId: this.e.doc().id,
      revision: this.e.revision(),
      pageId: this.e.pageId(),
      renderer: 'canvas',
      viewport: { x: viewport.x, y: viewport.y, width: viewport.width, height: viewport.height },
      nodes: this.e.pageNodes().map((n) => {
        const item = index.get(n.id),
          b = item?.bounds;
        return {
          id: n.id,
          selected: this.e.selection().includes(n.id),
          rendered: !!item,
          painted:
            !!item &&
            intersects(item.bounds, view) &&
            item.ancestors.every((a) => intersects(a.bounds, view)),
          bounds: b
            ? {
                x: viewport.x + pan.x + b.x * zoom,
                y: viewport.y + pan.y + b.y * zoom,
                width: b.width * zoom,
                height: b.height * zoom,
              }
            : null,
        };
      }),
    };
  }
  fit() {
    const nodes = this.projection.roots().map((i) => i.bounds);
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
  align(axis: 'x' | 'y') {
    const nodes = this.e.selectedRoots().filter((n) => !n.locked);
    if (nodes.length < 2 || nodes.some((n) => n.parentId !== nodes[0].parentId)) {
      this.e.error.set('Select siblings to align.');
      return;
    }
    const value = Math.min(...nodes.map((n) => n[axis]));
    this.e.perform(nodes.map((n) => ({ type: 'node.update', id: n.id, patch: { [axis]: value } })));
  }
  alignSelection(edge: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') {
    if (!this.canAlign()) return;
    const nodes = this.e.selectedRoots();
    const horizontal = ['left', 'center', 'right'].includes(edge);
    const axis = horizontal ? 'x' : 'y';
    const size = horizontal ? 'width' : 'height';
    const parent = this.e.doc().nodes.find((node) => node.id === nodes[0].parentId);
    const minimum = nodes.length === 1 ? 0 : Math.min(...nodes.map((node) => node[axis]));
    const maximum =
      nodes.length === 1
        ? parent![size]
        : Math.max(...nodes.map((node) => node[axis] + node[size]));
    const updates = nodes.map((node) => {
      const target =
        edge === 'left' || edge === 'top'
          ? minimum
          : edge === 'right' || edge === 'bottom'
            ? maximum - node[size]
            : (minimum + maximum - node[size]) / 2;
      return { type: 'node.update' as const, id: node.id, patch: { [axis]: target } };
    });
    this.e.perform(updates);
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
      if (this.e.native)
        void this.e.openNativePreview(board.id).catch((error) => this.e.report(error));
      else this.preview.set(board.id);
    } else this.e.error.set('Create an artboard to preview.');
  }
  closePreview(error: string) {
    this.preview.set(null);
    if (error) this.e.error.set(error);
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
  addVariant(name: string, fill: string) {
    const n = this.e.node();
    if (n?.isComponent && name.trim())
      this.e.update({ variants: { ...n.variants, [name.trim()]: { fill } } });
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
    if (this.preview()) return;
    const typing = (event.target as HTMLElement).matches('input,textarea,select,[contenteditable]');
    if (event.key === 'Escape') {
      if (this.commentUi.placing() || this.commentUi.draft()) {
        this.commentUi.cancel();
        return;
      }
      this.preview.set(null);
      this.e.select(null);
      return;
    }
    if (event.metaKey || event.ctrlKey) {
      if (event.key.toLowerCase() === 's' && !this.e.native) {
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
