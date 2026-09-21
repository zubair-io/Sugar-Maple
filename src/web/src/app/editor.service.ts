import { Injectable, computed, signal } from '@angular/core';
import { DocumentStore } from './model/store';
import {
  blankDocument,
  validateDocument,
  TransactionSchema,
  uid,
  type SceneDocument,
  type SceneNode,
  type Operation,
} from './model/schema';
import { exportNode, type ExportTarget } from './model/export';

declare global {
  interface Window {
    webkit?: { messageHandlers: { native: { postMessage: (message: unknown) => Promise<any> } } };
    sugarMaple: any;
  }
}
@Injectable({ providedIn: 'root' })
export class EditorService {
  store = new DocumentStore();
  readonly doc = signal(this.store.document);
  readonly revision = signal(0);
  readonly selected = signal<string | null>(null);
  readonly pageId = signal(this.doc().pages[0].id);
  readonly dirty = signal(true);
  readonly status = signal('Unsaved');
  readonly error = signal('');
  readonly mcp = signal(window.webkit ? 'Starting' : 'Mac app required for MCP');
  readonly mode = signal<'Design' | 'Prototype' | 'Developer'>('Design');
  readonly node = computed(() => this.doc().nodes.find((n) => n.id === this.selected()) ?? null);
  readonly pageNodes = computed(() =>
    this.doc()
      .nodes.filter((n) => n.pageId === this.pageId())
      .sort((a, b) => a.order - b.order),
  );
  readonly roots = computed(() => this.pageNodes().filter((n) => !n.parentId));
  readonly native = !!window.webkit;
  private recoveryTimer: any;
  constructor() {
    window.sugarMaple = {
      dispatch: (method: string, args: any) => this.dispatch(method, args),
      ready: true,
    };
    this.restore();
  }
  async bridge(action: string, payload: any = {}) {
    if (!window.webkit) throw Error('This action requires the Mac app');
    return window.webkit.messageHandlers.native.postMessage({ action, ...payload });
  }
  async restore() {
    try {
      const saved = this.native
        ? await this.bridge('recovery.load')
        : JSON.parse(localStorage.getItem('sugar-maple-recovery') ?? 'null');
      if (saved?.document) {
        this.replace(saved.document);
        this.status.set('Recovered — save to a file');
      }
      if (this.native) {
        const state = await this.bridge('status');
        this.mcp.set(state.status);
      }
    } catch (e) {
      this.report(e);
    }
  }
  report(e: unknown) {
    this.error.set(e instanceof Error ? e.message : String(e));
  }
  refresh() {
    this.doc.set(this.store.document);
    this.revision.set(this.store.revision);
    this.dirty.set(true);
    this.status.set('Unsaved changes');
    if (!this.doc().pages.some((p) => p.id === this.pageId()))
      this.pageId.set(this.doc().pages[0].id);
    if (!this.doc().nodes.some((n) => n.id === this.selected())) this.selected.set(null);
    clearTimeout(this.recoveryTimer);
    this.recoveryTimer = setTimeout(() => this.recover(), 500);
  }
  async recover() {
    try {
      const value = this.store.checkpoint();
      if (this.native) await this.bridge('recovery.save', { value });
      else localStorage.setItem('sugar-maple-recovery', JSON.stringify(value));
    } catch (e) {
      this.report(e);
    }
  }
  command(operations: Operation[], origin: 'human' | 'agent' = 'human') {
    const result = this.store.transact(
      {
        documentId: this.doc().id,
        expectedRevision: this.revision(),
        requestId: uid(),
        operations,
      },
      origin,
    );
    this.refresh();
    return result;
  }
  perform(operations: Operation[]) {
    try {
      return this.command(operations);
    } catch (e) {
      this.report(e);
      return null;
    }
  }
  replace(doc: SceneDocument) {
    this.store = new DocumentStore(validateDocument(doc));
    this.doc.set(this.store.document);
    this.revision.set(0);
    this.pageId.set(doc.pages[0].id);
    this.selected.set(null);
    this.dirty.set(true);
  }
  newDocument() {
    if (
      this.dirty() &&
      this.doc().nodes.length &&
      !confirm('Create a new file? Save your current work first if you want to keep it.')
    )
      return;
    this.bridge('file.reset').catch(() => {});
    this.replace(blankDocument());
    this.status.set('Unsaved');
    this.recover();
  }
  add(kind: SceneNode['kind']) {
    const current = this.node(),
      parent =
        kind === 'artboard'
          ? null
          : current && ['artboard', 'frame'].includes(current.kind)
            ? current.id
            : (current?.parentId ?? null);
    const result = this.perform([
      {
        type: 'node.add',
        node: {
          kind,
          pageId: this.pageId(),
          parentId: parent,
          name: kind === 'artboard' ? 'Desktop' : kind,
          x: parent ? 24 : 80 + this.roots().length * 60,
          y: parent ? 24 : 80,
          width: kind === 'artboard' ? 834 : kind === 'button' ? 160 : kind === 'text' ? 240 : 200,
          height:
            kind === 'artboard'
              ? 600
              : kind === 'text'
                ? 44
                : kind === 'input' || kind === 'button'
                  ? 44
                  : 160,
          text:
            kind === 'text'
              ? 'Your next idea'
              : kind === 'button'
                ? 'Continue'
                : kind === 'input'
                  ? 'Email address'
                  : '',
          fill: kind === 'button' ? '#2563eb' : kind === 'rectangle' ? '#e0e7ff' : '#ffffff',
          color: kind === 'button' ? '#ffffff' : '#18181b',
          radius: kind === 'button' || kind === 'input' ? 8 : 0,
          padding: 0,
        },
      },
    ]);
    if (result) this.selected.set(result.ids[0]);
  }
  update(patch: Partial<SceneNode>) {
    const n = this.node();
    if (n) this.perform([{ type: 'node.update', id: n.id, patch }]);
  }
  undo() {
    this.store.undo();
    this.refresh();
  }
  redo() {
    this.store.redo();
    this.refresh();
  }
  remove() {
    const n = this.node();
    if (n) this.perform([{ type: 'node.remove', id: n.id }]);
  }
  async save() {
    try {
      const revision = this.revision(),
        documentId = this.doc().id;
      if (this.native) {
        const result = await this.bridge('file.save', { value: this.store.checkpoint() });
        if (result.cancelled) return;
        const unchanged = this.revision() === revision && this.doc().id === documentId;
        this.dirty.set(!unchanged);
        this.status.set(unchanged ? 'Saved to .syrup bundle' : 'Unsaved changes');
      } else {
        download(
          this.doc().name + '.syrup.json',
          JSON.stringify(this.store.checkpoint()),
          'application/json',
        );
        this.status.set('Exported checkpoint');
      }
    } catch (e) {
      this.status.set('Save failed');
      this.report(e);
    }
  }
  async open() {
    try {
      if (
        this.doc().nodes.length &&
        this.dirty() &&
        !confirm('Open another file and replace unsaved work?')
      )
        return;
      if (this.native) {
        const result = await this.bridge('file.open');
        if (result.cancelled) return;
        this.replace(result.document);
        await this.bridge('file.acceptOpen');
        this.dirty.set(false);
        this.status.set('Opened .syrup bundle');
        this.recover();
      } else {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async () => {
          try {
            const value = JSON.parse(await input.files![0].text());
            this.replace(value.document);
            this.status.set('Imported checkpoint');
          } catch (e) {
            this.report(e);
          }
        };
        input.click();
      }
    } catch (e) {
      this.report(e);
    }
  }
  async copy(target: ExportTarget | 'name') {
    try {
      const n = this.node();
      if (!n) return;
      const text = target === 'name' ? n.name : exportNode(this.doc(), n.id, target);
      if (this.native) await this.bridge('clipboard.write', { text });
      else await navigator.clipboard.writeText(text);
      this.status.set('Copied ' + target);
    } catch (e) {
      this.report(e);
    }
  }
  async paste() {
    try {
      const text = this.native
        ? (await this.bridge('clipboard.read')).text
        : await navigator.clipboard.readText();
      const value = JSON.parse(text);
      if (value.format !== 'sugar-maple-elements' || !Array.isArray(value.nodes))
        throw Error('Clipboard does not contain editable Sugar Maple elements');
      const ids = new Map<string, string>(value.nodes.map((n: SceneNode) => [n.id, uid()]));
      this.perform(
        value.nodes.map((n: SceneNode) => ({
          type: 'node.add',
          node: {
            ...n,
            id: ids.get(n.id),
            pageId: this.pageId(),
            parentId: ids.get(n.parentId ?? '') ?? null,
            targetId: ids.get(n.targetId ?? '') ?? null,
            componentId: ids.get(n.componentId ?? '') ?? null,
            x: n.parentId ? n.x : n.x + 24,
            y: n.parentId ? n.y : n.y + 24,
          },
        })),
      );
    } catch (e) {
      this.report(e);
    }
  }
  async image(file: File) {
    try {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5000000)
        throw Error('Choose a PNG, JPEG or WebP under 5 MB');
      const reader = new FileReader();
      reader.onload = () => {
        const result = this.perform([
          {
            type: 'node.add',
            node: {
              kind: 'image',
              pageId: this.pageId(),
              name: file.name,
              asset: String(reader.result),
              width: 320,
              height: 240,
              x: 80,
              y: 80,
            },
          },
        ]);
        if (result) this.selected.set(result.ids[0]);
      };
      reader.readAsDataURL(file);
    } catch (e) {
      this.report(e);
    }
  }
  async dispatch(method: string, args: any = {}) {
    switch (method) {
      case 'document.get':
        return { ...this.store.result(), document: this.doc() };
      case 'document.new':
        if (this.native) await this.bridge('file.reset');
        this.replace(blankDocument(args.name ?? 'Untitled'));
        this.refresh();
        return this.store.result();
      case 'transaction.apply': {
        this.mcp.set('Agent writing');
        try {
          const result = this.store.transact(args, 'agent');
          this.refresh();
          return result;
        } finally {
          this.mcp.set('Ready · 127.0.0.1:48480');
        }
      }
      case 'history.undo':
        this.checkTarget(args);
        this.undo();
        return this.store.result();
      case 'history.redo':
        this.checkTarget(args);
        this.redo();
        return this.store.result();
      case 'selection.set':
        if (!this.doc().nodes.some((n) => n.id === args.id)) throw Error('Node not found');
        this.selected.set(args.id);
        this.pageId.set(this.node()!.pageId);
        return this.store.result();
      case 'code.export':
        return { code: exportNode(this.doc(), args.id, args.target) };
      case 'render.ready':
        this.checkTarget(args);
        await document.fonts.ready;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        this.checkTarget(args);
        return this.store.result();
      case 'capabilities':
        return {
          protocolVersion: 1,
          coordinateUnits: 'CSS pixels; parent relative',
          transactionSchema: TransactionSchema.toJSONSchema(),
          kinds: ['artboard', 'frame', 'rectangle', 'ellipse', 'text', 'button', 'input', 'image'],
        };
      default:
        throw Error('Unknown command');
    }
  }
  checkTarget(args: any) {
    if (args.documentId !== this.doc().id) throw Error('Wrong document');
    if (args.expectedRevision !== this.revision()) throw Error('Stale revision');
  }
}
export function download(name: string, value: string, type: string) {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
