import { synchronizeComponents } from './component-sync';
import { delta, applyDelta, JournalSchema, type JournalEntry } from './journal';
import { applyComposition, propagate } from './composition';
import * as Y from 'yjs';
import {
  blankDocument,
  validateDocument,
  NodeSchema,
  TransactionSchema,
  uid,
  type SceneDocument,
  type Operation,
} from './schema';

export class DocumentStore {
  private ydoc = new Y.Doc();
  private root = this.ydoc.getMap<unknown>('scene');
  private history = new Y.UndoManager(this.root, {
    trackedOrigins: new Set(['human', 'agent']),
    captureTimeout: 0,
  });
  private receipts = new Map<
    string,
    { signature: string; result: ReturnType<DocumentStore['result']> }
  >();
  private base: SceneDocument;
  private journal: JournalEntry[] = [];
  revision = 0;
  constructor(doc: SceneDocument = blankDocument()) {
    this.base = validateDocument(doc);
    this.write(this.base);
  }
  static fromCheckpoint(value: any): DocumentStore {
    if (!value || typeof value !== 'object') throw Error('Invalid document checkpoint');
    if (value.checkpointVersion === undefined)
      return new DocumentStore(validateDocument(value.document));
    if (value.checkpointVersion !== 2) throw Error('Unsupported checkpoint version');
    const entries = JournalSchema.parse(value.journal);
    const store = new DocumentStore(validateDocument(value.base));
    for (const entry of entries) {
      if (entry.kind === 'edit') {
        const next = validateDocument(applyDelta(store.document, entry.delta));
        if (
          entry.receipt.documentId !== store.document.id ||
          entry.receipt.revision !== store.revision + 1 ||
          store.receipts.has(entry.requestId)
        )
          throw Error('Invalid journal receipt');
        const transaction = TransactionSchema.parse(JSON.parse(entry.signature));
        if (
          transaction.documentId !== store.document.id ||
          transaction.expectedRevision !== store.revision ||
          transaction.requestId !== entry.requestId
        )
          throw Error('Invalid journal transaction');
        store.ydoc.transact(() => store.write(next), entry.origin);
        store.revision++;
        store.receipts.set(entry.requestId, { signature: entry.signature, result: entry.receipt });
        store.journal.push(entry);
      } else if (entry.kind === 'undo') store.undo();
      else store.redo();
    }
    const projection = validateDocument(value.document);
    if (canonical(store.document) !== canonical(projection))
      throw Error('Document projection does not match its history');
    return store;
  }
  get document(): SceneDocument {
    return {
      version: 1,
      id: this.root.get('id') as string,
      name: this.root.get('name') as string,
      folders: Array.from((this.root.get('folders') as Y.Map<any>).values())
        .map((v) => v.toJSON())
        .sort((a, b) => a.order - b.order),
      pages: Array.from((this.root.get('pages') as Y.Map<any>).values())
        .map((v) => v.toJSON())
        .sort((a, b) => a.order - b.order),
      nodes: Array.from((this.root.get('nodes') as Y.Map<any>).values()).map((v) => v.toJSON()),
      tokens: (this.root.get('tokens') as Y.Map<string>).toJSON(),
    };
  }
  private write(doc: SceneDocument) {
    this.root.set('id', doc.id);
    this.root.set('name', doc.name);
    for (const key of ['folders', 'pages', 'nodes', 'tokens'] as const) {
      let map = this.root.get(key) as Y.Map<any> | undefined;
      if (!map) {
        map = new Y.Map();
        this.root.set(key, map);
      }
      const records =
        key === 'tokens' ? doc.tokens : Object.fromEntries(doc[key].map((v) => [v.id, v]));
      for (const k of Array.from(map.keys())) if (!Object.hasOwn(records, k)) map.delete(k);
      for (const [k, value] of Object.entries(records)) {
        if (typeof value === 'string') {
          if (map.get(k) !== value) map.set(k, value);
          continue;
        }
        let item = map.get(k) as Y.Map<unknown> | undefined;
        if (!item) {
          item = new Y.Map();
          map.set(k, item);
        }
        for (const [field, val] of Object.entries(value))
          if (JSON.stringify(item.get(field)) !== JSON.stringify(val)) item.set(field, val);
      }
    }
  }
  result(ids: string[] = []): {
    documentId: string;
    revision: number;
    ids: string[];
    transactionId: string;
  } {
    return { documentId: this.document.id, revision: this.revision, ids, transactionId: uid() };
  }
  transact(input: unknown, origin: 'human' | 'agent' = 'human') {
    const tx = TransactionSchema.parse(input),
      signature = JSON.stringify(tx);
    const prior = this.receipts.get(tx.requestId);
    if (prior) {
      if (prior.signature !== signature) throw Error('Request ID reused with different operations');
      return prior.result;
    }
    if (tx.documentId !== this.document.id) throw Error('Wrong document');
    if (tx.expectedRevision !== this.revision) throw Error('Stale revision');
    const before = this.document;
    const doc = structuredClone(before),
      ids: string[] = [];
    for (const op of tx.operations) applyOperation(doc, op, ids);
    validateDocument(doc);
    synchronizeComponents(doc, before);
    validateDocument(doc);
    this.ydoc.transact(() => this.write(doc), origin);
    this.revision++;
    const result = this.result(ids);
    this.receipts.set(tx.requestId, { signature, result });
    this.journal.push({
      kind: 'edit',
      origin,
      delta: delta(before, doc),
      requestId: tx.requestId,
      signature,
      receipt: result,
    });
    return result;
  }
  undo() {
    this.history.undo();
    this.journal.push({ kind: 'undo' });
    this.revision++;
    return this.result();
  }
  redo() {
    this.history.redo();
    this.journal.push({ kind: 'redo' });
    this.revision++;
    return this.result();
  }
  get canUndo() {
    return this.history.undoStack.length > 0;
  }
  get canRedo() {
    return this.history.redoStack.length > 0;
  }
  checkpoint() {
    return structuredClone({
      checkpointVersion: 2,
      document: this.document,
      base: this.base,
      journal: this.journal,
    });
  }
}
function applyOperation(doc: SceneDocument, op: Operation, ids: string[]) {
  if (applyComposition(doc, op, ids)) return;
  switch (op.type) {
    case 'document.rename':
      doc.name = op.name;
      break;
    case 'token.set':
      doc.tokens[op.name] = op.value;
      break;
    case 'folder.add': {
      const id = op.id ?? uid();
      doc.folders.push({ id, name: op.name, order: doc.folders.length });
      ids.push(id);
      break;
    }
    case 'folder.update': {
      const folder = doc.folders.find((f) => f.id === op.id);
      if (!folder) throw Error('Folder not found');
      folder.name = op.name;
      break;
    }
    case 'folder.remove': {
      if (!doc.folders.some((f) => f.id === op.id)) throw Error('Folder not found');
      doc.folders = doc.folders.filter((f) => f.id !== op.id);
      for (const page of doc.pages) if (page.folderId === op.id) page.folderId = null;
      break;
    }
    case 'page.add': {
      const id = op.id ?? uid();
      doc.pages.push({ id, name: op.name, order: doc.pages.length, folderId: op.folderId ?? null });
      ids.push(id);
      break;
    }
    case 'page.update': {
      const page = doc.pages.find((p) => p.id === op.id);
      if (!page) throw Error('Page not found');
      if (op.name !== undefined) page.name = op.name;
      if (op.folderId !== undefined) page.folderId = op.folderId;
      break;
    }
    case 'page.remove': {
      if (!doc.pages.some((p) => p.id === op.id)) throw Error('Page not found');
      doc.pages = doc.pages.filter((p) => p.id !== op.id);
      for (const n of [...doc.nodes].filter((n) => n.pageId === op.id)) removeNode(doc, n.id);
      break;
    }
    case 'node.add': {
      const n = NodeSchema.parse({
        id: uid(),
        name: op.node.kind,
        order: doc.nodes.length,
        ...op.node,
      });
      doc.nodes.push(n);
      ids.push(n.id);
      break;
    }
    case 'node.update': {
      const n = doc.nodes.find((n) => n.id === op.id);
      if (!n) throw Error('Node not found');
      if (
        inheritedChild(doc, n) &&
        (op.patch.parentId !== undefined || op.patch.order !== undefined)
      )
        throw Error('Detach the instance before changing its layer structure');
      Object.assign(n, op.patch);
      propagate(doc, n, op.patch);
      break;
    }
    case 'node.remove':
      if (!doc.nodes.some((n) => n.id === op.id)) throw Error('Node not found');
      if (
        inheritedChild(
          doc,
          doc.nodes.find((n) => n.id === op.id)!,
        )
      )
        throw Error('Detach the instance before deleting an inherited layer');
      removeNode(doc, op.id);
      break;
  }
}
function removeNode(doc: SceneDocument, id: string) {
  const removed = new Set([id]);
  let count = 0;
  while (count !== removed.size) {
    count = removed.size;
    for (const n of doc.nodes) if (n.parentId && removed.has(n.parentId)) removed.add(n.id);
  }
  doc.nodes = doc.nodes
    .filter((n) => !removed.has(n.id))
    .map((n) => ({
      ...n,
      targetId: n.targetId && removed.has(n.targetId) ? null : n.targetId,
      componentId: n.componentId && removed.has(n.componentId) ? null : n.componentId,
      repeatTemplateId:
        n.repeatTemplateId && removed.has(n.repeatTemplateId) ? null : n.repeatTemplateId,
    }));
}

function canonical(value: unknown) {
  return JSON.stringify(value, (_, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );
}

function inheritedChild(doc: SceneDocument, node: SceneDocument['nodes'][number]) {
  const source = doc.nodes.find((n) => n.id === node.componentId);
  return (
    !!source?.parentId &&
    doc.nodes.some((n) => n.id === node.parentId && n.componentId === source.parentId)
  );
}
