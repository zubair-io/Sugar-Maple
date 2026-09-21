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
  revision = 0;
  constructor(doc: SceneDocument = blankDocument()) {
    this.write(validateDocument(doc));
  }
  get document(): SceneDocument {
    return {
      version: 1,
      id: this.root.get('id') as string,
      name: this.root.get('name') as string,
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
    for (const key of ['pages', 'nodes', 'tokens'] as const) {
      let map = this.root.get(key) as Y.Map<any> | undefined;
      if (!map) {
        map = new Y.Map();
        this.root.set(key, map);
      }
      const records =
        key === 'tokens' ? doc.tokens : Object.fromEntries(doc[key].map((v) => [v.id, v]));
      for (const k of Array.from(map.keys())) if (!(k in records)) map.delete(k);
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
  result(ids: string[] = []) {
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
    const doc = structuredClone(this.document),
      ids: string[] = [];
    for (const op of tx.operations) applyOperation(doc, op, ids);
    validateDocument(doc);
    this.ydoc.transact(() => this.write(doc), origin);
    this.revision++;
    const result = this.result(ids);
    this.receipts.set(tx.requestId, { signature, result });
    return result;
  }
  undo() {
    this.history.undo();
    this.revision++;
    return this.result();
  }
  redo() {
    this.history.redo();
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
    return { document: this.document, crdt: Array.from(Y.encodeStateAsUpdate(this.ydoc)) };
  }
}
function applyOperation(doc: SceneDocument, op: Operation, ids: string[]) {
  switch (op.type) {
    case 'document.rename':
      doc.name = op.name;
      break;
    case 'token.set':
      doc.tokens[op.name] = op.value;
      break;
    case 'page.add': {
      const id = op.id ?? uid();
      doc.pages.push({ id, name: op.name, order: doc.pages.length });
      ids.push(id);
      break;
    }
    case 'page.update': {
      const page = doc.pages.find((p) => p.id === op.id);
      if (!page) throw Error('Page not found');
      page.name = op.name;
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
      Object.assign(n, op.patch);
      break;
    }
    case 'node.remove':
      if (!doc.nodes.some((n) => n.id === op.id)) throw Error('Node not found');
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
    }));
}
