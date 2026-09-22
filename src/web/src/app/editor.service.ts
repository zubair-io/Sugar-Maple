import { RecoveryStore } from './model/recovery';
import { importTokens, exportTokens } from './model/tokens';
import { svgImport, svgExport } from './model/svg';
import { Injectable, computed, signal } from '@angular/core';
import { DocumentStore } from './model/store';
import {
  blankDocument,
  validateDocument,
  TransactionSchema,
  CommentsQuerySchema,
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
  readonly selection = signal<string[]>([]);
  readonly selected = computed(() => this.selection()[0] ?? null);
  readonly pageId = signal(this.doc().pages[0].id);
  readonly dirty = signal(true);
  readonly status = signal('Unsaved');
  readonly ready = signal(false);
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
  private recovery = this.native ? null : new RecoveryStore();
  constructor() {
    window.sugarMaple = {
      dispatch: (method: string, args: any) => this.dispatch(method, args),
      ready: false,
    };
    this.restore().finally(() => {
      this.ready.set(true);
      window.sugarMaple.ready = true;
    });
  }
  select(id: string | null, extend = false) {
    this.selection.update((ids) =>
      id === null
        ? []
        : !extend
          ? [id]
          : ids.includes(id)
            ? ids.filter((v) => v !== id)
            : [...ids, id],
    );
  }
  selectedRoots() {
    const ids = new Set(this.selection());
    return this.pageNodes().filter((n) => {
      if (!ids.has(n.id)) return false;
      let parent = n.parentId;
      while (parent) {
        if (ids.has(parent)) return false;
        parent = this.doc().nodes.find((v) => v.id === parent)?.parentId ?? null;
      }
      return true;
    });
  }
  async bridge(action: string, payload: any = {}) {
    if (!window.webkit) throw Error('This action requires the Mac app');
    return window.webkit.messageHandlers.native.postMessage({ action, ...payload });
  }
  async restore() {
    try {
      const saved = this.native
        ? await this.bridge('recovery.load')
        : ((await this.recovery!.read()) ??
          JSON.parse(localStorage.getItem('sugar-maple-recovery') ?? 'null'));
      if (saved?.document) {
        this.replace(saved.document, saved);
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
    this.selection.update((ids) => ids.filter((id) => this.doc().nodes.some((n) => n.id === id)));
    this.recover();
  }
  async recover() {
    try {
      const value = this.store.checkpoint();
      if (this.native) await this.bridge('recovery.save', { value });
      else {
        await this.recovery!.write(value);
        localStorage.removeItem('sugar-maple-recovery');
      }
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
  replace(doc: SceneDocument, checkpoint?: unknown) {
    this.store = checkpoint
      ? DocumentStore.fromCheckpoint(checkpoint)
      : new DocumentStore(validateDocument(doc));
    this.doc.set(this.store.document);
    this.revision.set(this.store.revision);
    this.pageId.set(doc.pages[0].id);
    this.select(null);
    this.dirty.set(true);
  }
  async newDocument() {
    if (
      this.dirty() &&
      this.doc().nodes.length &&
      !confirm('Create a new file? Save your current work first if you want to keep it.')
    )
      return;
    if (this.native) await this.bridge('file.reset');
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
    if (result) this.select(result.ids[0]);
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
    const nodes = this.selectedRoots().filter((n) => !n.locked);
    if (nodes.length) this.perform(nodes.map((n) => ({ type: 'node.remove', id: n.id })));
  }
  async save(saveAs = false) {
    try {
      const revision = this.revision(),
        documentId = this.doc().id;
      if (this.native) {
        const result = await this.bridge('file.save', { value: this.store.checkpoint(), saveAs });
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
        this.replace(result.document, result);
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
            this.replace(value.document, value);
            this.status.set('Imported checkpoint');
            this.recover();
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
      const tokenOps: Operation[] = [];
      const tokenNames = new Map<string, string>();
      for (const [name, color] of Object.entries(value.tokens ?? {})) {
        let imported = name;
        let suffix = 1;
        while (this.doc().tokens[imported] && this.doc().tokens[imported] !== color)
          imported = name + '_copy' + suffix++;
        tokenNames.set(name, imported);
        tokenOps.push({ type: 'token.set', name: imported, value: color as string });
      }
      this.perform([
        ...tokenOps,
        ...value.nodes.map((n: SceneNode) => ({
          type: 'node.add',
          node: {
            ...n,
            id: ids.get(n.id),
            pageId: this.pageId(),
            parentId: ids.get(n.parentId ?? '') ?? null,
            targetId: ids.get(n.targetId ?? '') ?? null,
            componentId: ids.get(n.componentId ?? '') ?? null,
            repeatTemplateId: ids.get(n.repeatTemplateId ?? '') ?? null,
            fillToken: tokenNames.get(n.fillToken) ?? n.fillToken,
            x: n.parentId ? n.x : n.x + 24,
            y: n.parentId ? n.y : n.y + 24,
          },
        })),
      ]);
    } catch (e) {
      this.report(e);
    }
  }
  async loadTokens(file: File) {
    try {
      this.perform(importTokens(JSON.parse(await file.text())));
    } catch (e) {
      this.report(e);
    }
  }
  async saveTokens() {
    try {
      const text = exportTokens(this.doc());
      if (this.native) await this.bridge('file.export', { name: 'tokens.json', text });
      else download('tokens.json', text, 'application/json');
    } catch (e) {
      this.report(e);
    }
  }
  async exportAsset(format: 'svg' | 'png') {
    try {
      const node = this.node();
      if (!node) return;
      const svg = svgExport(this.doc(), node.id);
      if (format === 'svg') {
        if (this.native) await this.bridge('file.export', { name: node.name + '.svg', text: svg });
        else download(node.name + '.svg', svg, 'image/svg+xml');
      } else {
        const image = new Image();
        image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
        await image.decode();
        if (node.width * node.height > 16000000)
          throw Error('PNG export is limited to 16 million pixels; use SVG for larger selections');
        const canvas = document.createElement('canvas');
        canvas.width = node.width;
        canvas.height = node.height;
        canvas.getContext('2d')!.drawImage(image, 0, 0);
        const data = canvas.toDataURL('image/png');
        if (this.native)
          await this.bridge('file.export', {
            name: node.name + '.png',
            base64: data.split(',')[1],
          });
        else {
          const a = document.createElement('a');
          a.href = data;
          a.download = node.name + '.png';
          a.click();
        }
      }
    } catch (e) {
      this.report(e);
    }
  }
  async image(file: File) {
    try {
      if (file.name.toLowerCase().endsWith('.svg')) {
        this.perform(svgImport(await file.text(), this.pageId(), file.name));
        return;
      }
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
        if (result) this.select(result.ids[0]);
      };
      reader.readAsDataURL(file);
    } catch (e) {
      this.report(e);
    }
  }
  async dispatch(method: string, args: any = {}) {
    switch (method) {
      case 'comments.list': {
        const query = CommentsQuerySchema.parse(args);
        if (query.pageId && !this.doc().pages.some((p) => p.id === query.pageId))
          throw Error('Page not found');
        return {
          ...this.store.result(),
          comments: this.doc()
            .comments.filter(
              (c) =>
                (!query.pageId || c.pageId === query.pageId) &&
                (query.status === 'all' || c.resolved === (query.status === 'resolved')),
            )
            .map((c) => ({
              ...c,
              pageName: this.doc().pages.find((p) => p.id === c.pageId)!.name,
            })),
        };
      }
      case 'document.checkpoint':
        return this.store.checkpoint();
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
        this.select(args.id);
        this.pageId.set(this.node()!.pageId);
        return this.store.result();
      case 'viewport.fit':
        return window.sugarMaple.viewport.fit();
      case 'layout.inspect': {
        await this.settleLayout();
        const canvas = document.querySelector('.viewport')!.getBoundingClientRect();
        return {
          documentId: this.doc().id,
          revision: this.revision(),
          pageId: this.pageId(),
          viewport: { x: canvas.x, y: canvas.y, width: canvas.width, height: canvas.height },
          nodes: this.pageNodes().map((n) => {
            const element = document.querySelector(`[data-node-id="${n.id}"]`);
            const rect = element?.getBoundingClientRect();
            return {
              id: n.id,
              rendered: !!rect,
              bounds: rect
                ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
                : null,
            };
          }),
        };
      }
      case 'code.export':
        return { code: exportNode(this.doc(), args.id, args.target) };
      case 'render.ready':
        this.checkTarget(args);
        await this.settleLayout();
        this.checkTarget(args);
        return this.store.result();
      case 'capabilities':
        return {
          protocolVersion: 1,
          coordinateUnits: 'CSS pixels; parent relative',
          transactionSchema: TransactionSchema.toJSONSchema(),
          commentsQuerySchema: CommentsQuerySchema.toJSONSchema(),
          kinds: [
            'artboard',
            'frame',
            'rectangle',
            'ellipse',
            'text',
            'button',
            'input',
            'image',
            'path',
          ],
        };
      default:
        throw Error('Unknown command');
    }
  }
  private async settleLayout() {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        document.fonts.ready,
        new Promise((_, reject) => {
          timeout = setTimeout(() => reject(Error('Font loading timed out')), 5000);
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
    // WKWebView suspends RAF when occluded. Its snapshot API still lays out the page;
    // force CSS layout after a bounded Angular render opportunity in that case.
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 200);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          clearTimeout(timer);
          resolve();
        }),
      );
    });
    document.documentElement.getBoundingClientRect();
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
