import { embeddedAsset } from './model/assets';
import { SceneFonts } from './canvas/scene-fonts';
import { discoverEditor, readScope } from './model/scoped-read';
import { toolOutputJSONSchemas } from './model/tool-output';
import { PersistenceQueue } from './model/persistence-queue';
import { pasteElements } from './model/clipboard';
import { toolArguments, toolError, toolInputJSONSchemas } from './model/tool-contract';
import { RecoveryStore } from './model/recovery';
import { importTokens, exportTokens } from './model/tokens';
import { svgImport, svgExport } from './model/svg';
import { Injectable, computed, signal, inject, effect } from '@angular/core';
import { SceneAssets } from './canvas/scene-assets';
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
import { exportNode, exportSupport, type ExportTarget } from './model/export';
import { assertHumanEdits, lockingNode } from './model/edit-locks';
import type { ReparentPlan, ReparentRequest } from './canvas/reparent-geometry';

declare global {
  interface Window {
    webkit?: { messageHandlers: { native: { postMessage: (message: unknown) => Promise<any> }; preview?: { postMessage: (message: unknown) => Promise<any> } } };
    sugarMaple: any;
  }
}
export interface TextEditControl { pending(): boolean; finish(): boolean; cancel(): void; }

@Injectable({ providedIn: 'root' })
export class EditorService {
  readonly assets = inject(SceneAssets);
  readonly fonts = inject(SceneFonts);
  store = new DocumentStore();
  readonly openFiles = signal<{ id: string; name: string }[]>([]);
  readonly tabBusy = signal(false);
  private readonly fileSessions = new Map<
    string,
    { store: DocumentStore; pageId: string; selection: string[] }
  >();
  readonly doc = signal(this.store.document);
  readonly revision = signal(0);
  readonly selection = signal<string[]>([]);
  readonly selected = computed(() => this.selection()[0] ?? null);
  readonly pageId = signal(this.doc().pages[0].id);
  readonly dirty = signal(true);
  readonly status = signal('Unsaved');
  readonly ready = signal(false);
  readonly error = signal('');
  readonly textDraft = signal(false);
  private textEdit: TextEditControl | null = null;
  readonly mcp = signal(window.webkit ? 'Starting' : 'Mac app required for MCP');
  readonly mode = signal<'Design' | 'Prototype' | 'Developer'>('Design');
  readonly nativePreviewRoot = signal<string | null>(null);
  readonly node = computed(() => this.doc().nodes.find((n) => n.id === this.selected()) ?? null);
  private readonly nodeIndex = computed(() => new Map(this.doc().nodes.map(node => [node.id, node])));
  readonly pageNodes = computed(() =>
    this.doc()
      .nodes.filter((n) => n.pageId === this.pageId())
      .sort((a, b) => a.order - b.order),
  );
  readonly roots = computed(() => this.pageNodes().filter((n) => !n.parentId));
  readonly native = !!window.webkit;
  private readonly persistence = new PersistenceQueue();
  private recovery = this.native ? null : new RecoveryStore();
  constructor() {
    effect(() => {
      const root = this.nativePreviewRoot(), document = this.doc(), revision = this.revision();
      if (root) void this.bridge('preview.update', { value: { version: 1, documentId: document.id, revision, rootId: root, document } }).catch(e => this.report(e));
    });
    effect(() => {
      this.assets.prune(this.doc().nodes, this.doc().assets);
      for (const n of this.doc().nodes)
        if (['text', 'button', 'input'].includes(n.kind)) this.fonts.get(n.fontFamily);
    });
    window.sugarMaple = {
      previewClosed: (error = '') => {
        this.nativePreviewRoot.set(null);
        if (error) this.error.set(error);
        document.querySelector<HTMLElement>('editor-header [data-preview-launcher] button')?.focus();
      },
      dispatch: (method: string, args: any) => this.dispatch(method, args),
      describeError: (error: unknown) =>
        toolError(error, { documentId: this.doc().id, revision: this.revision() }),
      fileCommand: async (command: string) => {
        if (!this.native || !this.ready()) throw Error('Native editor not ready');
        switch (command) {
          case 'new':
            return this.newDocument();
          case 'open':
            return this.open();
          case 'save':
            return this.save();
          case 'saveAs':
            return this.save(true);
          default:
            throw Error('Unknown file command');
        }
      },
      flushAutosave: async () => {
        await this.persistence.idle();
        if (this.dirty())
          throw Error('Automatic save has not completed. Keep the app open and retry Save.');
      },
      ready: false,
    };
    this.restore().finally(async () => {
      await this.fonts.ready.catch((error) =>
        this.error.set(error instanceof Error ? error.message : String(error)),
      );
      this.ready.set(true);
      window.sugarMaple.ready = true;
    });
  }
  registerTextEdit(control: TextEditControl) {
    this.textEdit = control;
    return () => { if (this.textEdit === control) { this.textEdit = null; this.textDraft.set(false); } };
  }
  finishTextEditing(): boolean { return this.textEdit?.finish() ?? true; }
  cancelTextEditing() { this.textEdit?.cancel(); }
  setMode(mode: 'Design' | 'Prototype' | 'Developer') {
    if (this.finishTextEditing()) this.mode.set(mode);
  }
  private assertNoTextDraft() {
    if (this.textEdit?.pending()) throw Error('Finish or cancel the current text edit before changing the document or capturing it.');
  }
  select(id: string | null, extend = false) {
    if (!this.finishTextEditing()) return false;
    this.selection.update((ids) =>
      id === null
        ? []
        : !extend
          ? [id]
          : ids.includes(id)
            ? ids.filter((v) => v !== id)
            : [...ids, id],
    );
    return true;
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
  async openNativePreview(rootId: string) {
    await this.bridge('preview.open', { value: { version: 1, documentId: this.doc().id, revision: this.revision(), rootId, document: this.doc() } });
    this.nativePreviewRoot.set(rootId);
  }
  async restore() {
    try {
      const saved = this.native
        ? await this.bridge('recovery.load')
        : ((await this.recovery!.read()) ??
          JSON.parse(localStorage.getItem('sugar-maple-recovery') ?? 'null'));
      if (saved?.document) {
        this.replace(saved.document, saved);
        this.status.set('Saving…');
      }
      if (this.native) {
        const state = await this.bridge('status');
        this.mcp.set(state.status);
      }
      this.updateFileTab();
      await this.recover();
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
    this.updateFileTab();
    this.dirty.set(true);
    this.status.set('Unsaved changes');
    if (!this.doc().pages.some((p) => p.id === this.pageId()))
      this.pageId.set(this.doc().pages[0].id);
    this.selection.update((ids) => ids.filter((id) => this.doc().nodes.some((n) => n.id === id)));
    this.recover();
  }
  async recover() {
    const value = this.store.checkpoint(),
      revision = this.revision(),
      documentId = this.doc().id;
    this.status.set('Saving…');
    try {
      const managed = await this.persistence.run(async () => {
        if (this.native) return (await this.bridge('file.autosave', { value })).managed;
        await this.recovery!.write(value);
        localStorage.removeItem('sugar-maple-recovery');
        return true;
      });
      if (this.doc().id === documentId && this.revision() === revision) {
        this.dirty.set(false);
        this.status.set(
          this.native
            ? managed
              ? 'Saved locally'
              : 'Saved to .syrup bundle'
            : 'Saved in this browser',
        );
      }
    } catch (e) {
      if (this.doc().id === documentId && this.revision() === revision) {
        this.dirty.set(true);
        this.status.set('Save failed — retry Save');
        this.report(e);
      }
    }
  }
  command(operations: Operation[], origin: 'human' | 'agent' = 'human') {
    if (origin === 'agent') this.assertNoTextDraft();
    if (origin === 'human') assertHumanEdits(this.doc(), operations);
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
  lockedBy(node: SceneNode | null): SceneNode | null {
    return lockingNode(this.nodeIndex(), node?.id ?? null);
  }
  insertionParent(kind: SceneNode['kind']): string | null {
    const current = this.node();
    return kind === 'artboard' ? null : current && ['artboard', 'frame'].includes(current.kind)
      ? current.id : current?.parentId ?? null;
  }
  canInsert(kind: SceneNode['kind']): boolean {
    return !lockingNode(this.nodeIndex(), this.insertionParent(kind));
  }
  async prepareReparent(request: ReparentRequest): Promise<ReparentPlan> {
    this.checkTarget(request);
    const pageId = this.doc().nodes.find(node => node.id === request.ids[0])?.pageId;
    if (!pageId) throw Error('Node not found');
    await this.settleLayout(this.doc().nodes.filter(node => node.pageId === pageId));
    this.checkTarget(request);
    return window.sugarMaple.viewport.planReparent(request);
  }
  commitReparent(request: ReparentRequest, plan: ReparentPlan, origin: 'human' | 'agent' = 'human') {
    this.checkTarget(request);
    return plan.operations.length ? this.command(plan.operations, origin) : this.store.result();
  }
  private updateFileTab() {
    const entry = { id: this.doc().id, name: this.doc().name };
    this.openFiles.update((tabs) =>
      tabs.some((t) => t.id === entry.id)
        ? tabs.map((t) => (t.id === entry.id ? entry : t))
        : [...tabs, entry],
    );
  }
  private rememberFile() {
    this.fileSessions.set(this.doc().id, {
      store: this.store,
      pageId: this.pageId(),
      selection: this.selection(),
    });
  }
  private async requireSaved() {
    if (!this.finishTextEditing()) throw Error(this.error());
    await this.persistence.idle();
    if (this.dirty())
      throw Error('Save this file successfully before switching or closing its tab.');
  }
  async switchFile(id: string) {
    if (id === this.doc().id || this.tabBusy()) return;
    this.tabBusy.set(true);
    try {
      await this.requireSaved();
      const session = this.fileSessions.get(id);
      if (!session) throw Error('This file is no longer open');
      this.rememberFile();
      this.store = session.store;
      this.doc.set(this.store.document);
      this.revision.set(this.store.revision);
      this.pageId.set(session.pageId);
      this.selection.set(session.selection);
      this.error.set('');
      await this.recover();
    } catch (error) {
      this.report(error);
    } finally {
      this.tabBusy.set(false);
    }
  }
  async closeFile(id: string) {
    if (this.tabBusy()) return;
    if (id === this.doc().id) {
      const next = this.openFiles().find((tab) => tab.id !== id);
      if (next) {
        await this.switchFile(next.id);
        if (this.doc().id === id) return;
      } else {
        try {
          await this.requireSaved();
          if (this.native) {
            await this.bridge('window.close');
            return;
          }
          await this.newDocument();
          if (this.doc().id === id) return;
        } catch (error) {
          this.report(error);
          return;
        }
      }
    }
    this.fileSessions.delete(id);
    this.openFiles.update((tabs) => tabs.filter((tab) => tab.id !== id));
  }
  replace(doc: SceneDocument, checkpoint?: unknown) {
    if (!this.finishTextEditing()) throw Error(this.error());
    if (this.ready()) this.rememberFile();
    this.store = checkpoint
      ? DocumentStore.fromCheckpoint(checkpoint)
      : new DocumentStore(validateDocument(doc));
    this.doc.set(this.store.document);
    this.revision.set(this.store.revision);
    this.pageId.set(doc.pages[0].id);
    this.updateFileTab();
    this.select(null);
    this.dirty.set(true);
  }
  async newDocument() {
    if (this.tabBusy()) return;
    this.tabBusy.set(true);
    try {
      await this.requireSaved();
      let name = 'Untitled',
        number = 2;
      while (this.openFiles().some((tab) => tab.name === name)) name = `Untitled ${number++}`;
      this.replace(blankDocument(name));
      this.error.set('');
      await this.recover();
    } catch (error) {
      this.report(error);
    } finally {
      this.tabBusy.set(false);
    }
  }
  add(kind: SceneNode['kind']) {
    const parent = this.insertionParent(kind);
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
    const nodes = this.selectedRoots();
    if (nodes.length) this.perform(nodes.map((n) => ({ type: 'node.remove', id: n.id })));
  }
  async save(saveAs = false) {
    try {
      if (!this.finishTextEditing()) throw Error(this.error());
      this.status.set('Saving…');
      const revision = this.revision(),
        documentId = this.doc().id;
      if (this.native) {
        const value = this.store.checkpoint();
        const result = await this.persistence.run(() =>
          this.bridge('file.save', { value, saveAs }),
        );
        if (result.cancelled) {
          await this.recover();
          return;
        }
        if (
          this.doc().id === documentId &&
          this.doc().name === value.document.name &&
          result.name &&
          result.name !== this.doc().name
        ) {
          this.command([{ type: 'document.rename', name: result.name }]);
          return;
        }
        const unchanged = this.revision() === revision && this.doc().id === documentId;
        if (this.doc().id === documentId) {
          this.dirty.set(!unchanged);
          this.status.set(unchanged ? 'Saved to .syrup bundle' : 'Saving…');
        }
      } else {
        download(
          this.doc().name + '.syrup.json',
          JSON.stringify(this.store.checkpoint()),
          'application/json',
        );
        await this.recover();
      }
    } catch (e) {
      this.dirty.set(true);
      this.status.set('Save failed — retry Save');
      this.report(e);
    }
  }
  async open() {
    try {
      if (!this.finishTextEditing()) throw Error(this.error());
      await this.persistence.idle();
      if (this.dirty() && !confirm('Open another file and replace unsaved work?')) return;
      if (this.native) {
        const result = await this.bridge('file.open');
        if (result.cancelled) return;
        this.replace(result.document, result);
        await this.bridge('file.acceptOpen', { documentId: this.doc().id });
        if (result.fileName && result.fileName !== this.doc().name) {
          this.command([{ type: 'document.rename', name: result.fileName }]);
          return;
        }
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
      if (this.native) await this.bridge('clipboard.write', { text, format: target === 'editable' ? 'editable' : 'text' });
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
      const paste = pasteElements(this.doc(), this.pageId(), text);
      await this.performDecoded(paste.operations, this.doc().id, this.revision());
      this.select(paste.rootId);
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
  async performDecoded(operations: Operation[], expectedDocumentId: string, expectedRevision: number, stillCurrent: () => boolean = () => true) {
    assertHumanEdits(this.doc(), operations);
    await this.validateAssetOperations(operations);
    if (!stillCurrent()) throw Error('Import canceled before applying data');
    if (this.doc().id !== expectedDocumentId || this.revision() !== expectedRevision) throw Error('Document changed while data loaded. Preview the import again.');
    return this.command(operations);
  }
  async validateAssetOperations(operations: Operation[]) {
    const sources = operations.flatMap(op => op.type === 'asset.set' ? [op.source] :
      op.type === 'repeat.import' ? op.rows.flatMap(row=>op.fields.filter(field=>field.property==='asset').flatMap(field=>{
        const reference=row[field.field];return reference?.startsWith('asset:') && Object.hasOwn(this.doc().assets,reference.slice(6)) ? [this.doc().assets[reference.slice(6)]] : [];
      })) : []);
    for (const source of new Set(sources)) {
      embeddedAsset(source);
      await this.assets.settle([{ kind: 'image', asset: source } as SceneNode]);
      if (this.assets.get(source).state !== 'ready') throw Error('Image could not be decoded. Choose a valid PNG, JPEG or WebP.');
    }
  }
  async image(file: File, replaceId?: string) {
    try {
      const documentId = this.doc().id,
        pageId = this.pageId(),
        revision = this.revision();
      if (this.mode() !== 'Design') throw Error('Switch to Design mode to import an image');
      const checkContext = () => {
        if (
          this.doc().id !== documentId ||
          this.pageId() !== pageId ||
          this.revision() !== revision ||
          this.mode() !== 'Design'
        )
          throw Error('Document changed while the image loaded. Select the image and try again.');
      };
      if (file.name.toLowerCase().endsWith('.svg')) {
        if (replaceId) throw Error('Replace an image with a PNG, JPEG or WebP');
        const text = await file.text();
        checkContext();
        this.perform(svgImport(text, pageId, file.name));
        return;
      }
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5000000)
        throw Error('Choose a PNG, JPEG or WebP under 5 MB');
      const asset = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(Error('Image file could not be read'));
        reader.readAsDataURL(file);
      });
      await this.assets.settle([{ kind: 'image', asset } as SceneNode]);
      checkContext();
      if (this.assets.get(asset).state !== 'ready')
        throw Error('Image could not be decoded. Choose a valid PNG, JPEG or WebP.');
      const shared = embeddedAsset(asset);
      const assetOperation: Operation = { type: 'asset.set', key: shared.key, source: asset };
      if (replaceId) {
        if (this.doc().nodes.find((n) => n.id === replaceId)?.kind !== 'image')
          throw Error('Select an image to replace');
        this.perform([assetOperation, { type: 'node.update', id: replaceId, patch: { asset: shared.reference } }]);
        return;
      }
      const result = this.perform([
        assetOperation,
        {
          type: 'node.add',
          node: {
            kind: 'image',
            pageId,
            name: file.name,
            asset: shared.reference,
            width: 320,
            height: 240,
            x: 80,
            y: 80,
          },
        },
      ]);
      if (result) this.select(result.ids[0]);
    } catch (e) {
      this.assets.prune(this.doc().nodes, this.doc().assets);
      for (const n of this.doc().nodes)
        if (['text', 'button', 'input'].includes(n.kind)) this.fonts.get(n.fontFamily);
      this.report(e);
    }
  }
  async dispatch(method: string, args: any = {}) {
    args = toolArguments(method, args);
    switch (method) {
      case 'editor.discover':
        return discoverEditor(this.doc(), this.revision(), this.pageId(), this.selection());
      case 'document.read':
        return readScope(this.doc(), this.revision(), args, this.selection());
      case 'comments.list': {
        const query = CommentsQuerySchema.parse(args);
        if (query.pageId && !this.doc().pages.some((p) => p.id === query.pageId))
          throw Error('Page not found');
        return structuredClone({
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
        });
      }
      case 'document.checkpoint':
        return this.store.checkpoint();
      case 'document.get':
        return {
          ...this.store.result(),
          document: structuredClone(this.doc()),
          durable: !this.dirty(),
          persistence: this.status(),
          assetDiagnostics: this.assets.diagnostics(this.doc().nodes, this.doc().assets),
        };
      case 'document.new':
        await this.requireSaved();
        this.replace(blankDocument(args.name ?? 'Untitled'));
        this.refresh();
        return this.store.result();
      case 'transaction.apply': {
        this.assertNoTextDraft();
        const previousStatus = this.mcp();
        this.mcp.set('Agent writing');
        try {
          await this.validateAssetOperations(args.operations);
          this.assertNoTextDraft();
          const result = this.store.transact(args, 'agent');
          this.refresh();
          return result;
        } finally {
          this.mcp.set(previousStatus);
        }
      }
      case 'history.undo':
        this.assertNoTextDraft();
        this.checkTarget(args);
        this.undo();
        return this.store.result();
      case 'history.redo':
        this.assertNoTextDraft();
        this.checkTarget(args);
        this.redo();
        return this.store.result();
      case 'selection.set':
        if (!this.doc().nodes.some((n) => n.id === args.id)) throw Error('Node not found');
        if (!this.select(args.id)) throw Error(this.error());
        this.pageId.set(this.node()!.pageId);
        return this.store.result();
      case 'nodes.reparent': {
        this.assertNoTextDraft();
        const plan = await this.prepareReparent(args);
        this.assertNoTextDraft();
        return this.commitReparent(args, plan, 'agent');
      }
      case 'viewport.fit':
        return window.sugarMaple.viewport.fit();
      case 'layout.inspect': {
        await this.settleLayout();
        return window.sugarMaple.viewport.inspect();
      }
      case 'code.export':
        return { code: exportNode(this.doc(), args.id, args.target), ...(['tailwind-classes', 'css-declarations', 'html-css'].includes(args.target) ? exportSupport(this.doc(), args.id, args.target) : {}) };
      case 'render.capture':
      case 'render.ready':
        this.assertNoTextDraft();
        this.checkTarget(args);
        if (window.sugarMaple.viewport?.hasDraft?.()) throw Error('Finish or cancel the current gesture before capturing a committed document.');
        await this.settleLayout();
        this.assertNoTextDraft();
        this.checkTarget(args);
        if (window.sugarMaple.viewport?.hasDraft?.()) throw Error('Finish or cancel the current gesture before capturing a committed document.');
        return {
          ...this.store.result(),
          committed: true,
          rendered: true,
          durable: !this.dirty(),
          persistence: this.status(),
          assetDiagnostics: this.assets.diagnostics(this.pageNodes(), this.doc().assets),
          ...(method === 'render.capture' ? { captureRequest: args } : {}),
        };
      case 'capabilities':
        return {
          protocolVersion: 1,
          coordinateUnits: 'CSS pixels; parent relative',
          transactionSchema: TransactionSchema.toJSONSchema(),
          commentsQuerySchema: CommentsQuerySchema.toJSONSchema(),
          toolSchemas: toolInputJSONSchemas(),
          toolOutputSchemas: toolOutputJSONSchemas(),
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
  private async settleLayout(nodes = this.pageNodes()) {
    await this.assets.settle(nodes, this.doc().assets);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.fonts.settle(nodes).then(() => document.fonts.ready),
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
    window.sugarMaple.viewport?.flush?.();
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
