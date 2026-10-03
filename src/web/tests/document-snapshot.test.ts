import { expect, test } from 'bun:test';
import { DocumentStore } from '../src/app/model/store';
import { blankDocument, NodeSchema } from '../src/app/model/schema';
import { libraryKey } from '../src/app/model/library-schema';
import { discoverEditor, readScope } from '../src/app/model/scoped-read';
import { webAwesomeManifest } from '../../../tools/library-fixture';

function fixture() {
  const doc = blankDocument();
  doc.nodes = [
    NodeSchema.parse({
      id: 'gradient',
      name: 'Gradient',
      pageId: doc.pages[0].id,
      kind: 'rectangle',
      gradient: {
        type: 'linear',
        stops: [
          { offset: 0, color: '#112233' },
          { offset: 1, color: '#ffffff' },
        ],
      },
    }),
  ];
  return doc;
}

function edit(store: DocumentStore, operations: unknown[]) {
  return store.transact({
    documentId: store.document.id,
    expectedRevision: store.revision,
    requestId: crypto.randomUUID(),
    operations,
  });
}

test('mutating a nested node in a read snapshot cannot change the scene or recovery base', () => {
  const store = new DocumentStore(fixture()),
    before = store.checkpoint();
  const snapshot = store.document;
  snapshot.nodes[0].gradient!.stops[0].color = '#ff0000';
  snapshot.nodes[0].gradient!.stops.push({ offset: 0.5, color: '#00ff00' });
  expect(store.checkpoint()).toEqual(before);
  expect(store.revision).toBe(0);
  expect(store.canUndo).toBe(false);
  expect(
    DocumentStore.fromCheckpoint(JSON.parse(JSON.stringify(store.checkpoint()))).document,
  ).toEqual(before.document);
});

test('comment messages, library mappings and instance properties are detached from read snapshots', () => {
  const store = new DocumentStore(fixture()),
    pageId = store.document.pages[0].id;
  const key = libraryKey(webAwesomeManifest);
  edit(store, [
    { type: 'comment.add', id: 'feedback', pageId, text: 'Keep this feedback.' },
    { type: 'library.import', manifest: webAwesomeManifest },
    {
      type: 'library.insert',
      id: 'button',
      key,
      component: 'Button',
      pageId,
      x: 0,
      y: 0,
      props: { label: 'Save' },
      variant: 'Primary',
    },
  ]);
  const before = store.checkpoint(),
    snapshot = store.document;
  snapshot.comments[0].messages[0].text = 'Untracked feedback';
  snapshot.libraries[key].components.Button.web!.module = 'untracked-package/button.js';
  snapshot.nodes.find((n) => n.id === 'button')!.libraryRef!.props.label = 'Untracked label';
  expect(store.checkpoint()).toEqual(before);
  expect(store.revision).toBe(1);
  expect(store.canUndo).toBe(true);
});

test('snapshot mutation cannot poison later edits, undo, redo or recovered history', () => {
  const store = new DocumentStore(fixture()),
    initial = store.document;
  const snapshot = store.document;
  edit(store, [{ type: 'node.update', id: 'gradient', patch: { x: 42 } }]);
  snapshot.nodes[0].gradient!.stops[0].color = '#ff0000';
  const current = store.document;
  current.nodes[0].gradient!.stops[0].color = '#00ff00';
  const restored = DocumentStore.fromCheckpoint(JSON.parse(JSON.stringify(store.checkpoint())));
  expect(restored.document.nodes[0]).toEqual({ ...initial.nodes[0], x: 42 });
  restored.undo();
  expect(restored.document).toEqual(initial);
  restored.redo();
  expect(restored.document.nodes[0]).toEqual({ ...initial.nodes[0], x: 42 });
  store.undo();
  expect(store.document).toEqual(initial);
});

test('scoped and discovery reads detach nodes, library dependencies, page and folder references', () => {
  const store = new DocumentStore(fixture()),
    pageId = store.document.pages[0].id;
  const key = libraryKey(webAwesomeManifest);
  edit(store, [
    { type: 'folder.add', id: 'folder', name: 'Original folder' },
    { type: 'page.update', id: pageId, folderId: 'folder' },
    { type: 'library.import', manifest: webAwesomeManifest },
    { type: 'library.insert', id: 'button', key, component: 'Button', pageId, x: 0, y: 0 },
  ]);
  const doc = store.document,
    before = structuredClone(doc);
  const read = readScope(
    doc,
    store.revision,
    {
      documentId: doc.id,
      expectedRevision: store.revision,
      scope: 'document',
      offset: 0,
      limit: 100,
    },
    [],
  );
  read.nodes[0].gradient!.stops[0].color = '#ff0000';
  read.references.pages[0].name = 'Untracked page';
  read.references.libraries[key].components.Button.web!.module = 'untracked-package/button.js';
  const discovery = discoverEditor(doc, store.revision, pageId, []);
  discovery.folders[0].name = 'Untracked folder';
  expect(doc).toEqual(before);
  expect(store.document).toEqual(before);
});

test('mutating a returned transaction receipt cannot corrupt retry receipts or saved history', () => {
  const store = new DocumentStore(fixture());
  const request = {
    documentId: store.document.id,
    expectedRevision: 0,
    requestId: crypto.randomUUID(),
    operations: [{ type: 'document.rename', name: 'Edited' }],
  };
  const receipt = store.transact(request),
    expected = structuredClone(receipt);
  const checkpoint = store.checkpoint();
  receipt.documentId = 'wrong-document';
  receipt.revision = 999;
  receipt.ids.push('untracked-id');
  expect(store.transact(request)).toEqual(expected);
  expect(store.checkpoint()).toEqual(checkpoint);
  const retry = store.transact(request);
  retry.transactionId = 'untracked-transaction';
  expect(store.transact(request)).toEqual(expected);
  const restored = DocumentStore.fromCheckpoint(JSON.parse(JSON.stringify(store.checkpoint())));
  restored.undo();
  expect(restored.document.name).toBe(fixture().name);
});
