import { test, expect } from 'bun:test';
import { DocumentStore } from '../src/app/model/store';
import { blankDocument, validateDocument, uid } from '../src/app/model/schema';

const future = { vendor: 'next-editor', nested: [null, true, 2, { label: 'Preserve me' }] };
function fixture() {
  const doc = blankDocument();
  return {
    ...doc,
    futureMetadata: structuredClone(future),
    documentMetadata: { originalPublicField: true },
    folders: [{ id: 'folder', name: 'Folder', order: 0, futureMetadata: structuredClone(future) }],
    pages: [{ ...doc.pages[0], folderId: 'folder', futureMetadata: structuredClone(future) }],
  };
}
function check(store: DocumentStore) {
  expect(store.document.futureMetadata).toEqual(future);
  expect(store.document.documentMetadata).toEqual({ originalPublicField: true });
  expect(store.document.pages[0].futureMetadata).toEqual(future);
  expect(store.document.folders[0].futureMetadata).toEqual(future);
}

test('opaque document/page/folder metadata survives editing, undo/redo and serialized journal recovery', () => {
  const store = new DocumentStore(fixture());
  check(store);
  store.transact({
    documentId: store.document.id,
    expectedRevision: store.revision,
    requestId: uid(),
    operations: [
      { type: 'document.rename', name: 'Edited title' },
      { type: 'page.update', id: store.document.pages[0].id, name: 'Edited page' },
      { type: 'folder.update', id: 'folder', name: 'Edited folder' },
    ],
  });
  check(store);
  store.undo();
  check(store);
  expect(store.document.name).not.toBe('Edited title');
  store.redo();
  check(store);
  expect(store.document.name).toBe('Edited title');
  const reopened = DocumentStore.fromCheckpoint(JSON.parse(JSON.stringify(store.checkpoint())));
  expect(reopened.document).toEqual(store.document);
  check(reopened);
  reopened.undo();
  check(reopened);
  expect(reopened.document.name).not.toBe('Edited title');
});

test('unknown metadata remains JSON data and does not weaken commands or future schema rejection', () => {
  expect(() => validateDocument({ ...fixture(), version: 2 })).toThrow();
  expect(() => validateDocument({ ...fixture(), futureMetadata: () => 'executable' })).toThrow();
  expect(() =>
    validateDocument({ ...fixture(), pages: [{ ...fixture().pages[0], extra: Infinity }] }),
  ).toThrow();
  const store = new DocumentStore(fixture());
  const before = store.checkpoint();
  expect(() =>
    store.transact({
      documentId: store.document.id,
      expectedRevision: 0,
      requestId: uid(),
      operations: [
        { type: 'page.update', id: store.document.pages[0].id, futureMetadata: { replace: true } },
      ],
    }),
  ).toThrow();
  expect(store.checkpoint()).toEqual(before);
});

test('reserved or cyclic metadata rejects explicitly instead of silently dropping JSON fields', () => {
  const top = fixture() as any;
  Object.defineProperty(top, '__proto__', { value: { preserve: true }, enumerable: true });
  expect(() => validateDocument(top)).toThrow('Unsupported metadata key');
  const nested = { ...fixture(), futureMetadata: JSON.parse('{"__proto__":{"preserve":true}}') };
  expect(() => validateDocument(nested)).toThrow('Unsupported metadata key');
  const cyclic: any = { label: 'cycle' };
  cyclic.self = cyclic;
  expect(() => validateDocument({ ...fixture(), futureMetadata: cyclic })).toThrow('acyclic JSON');
});

test('reading a scene cannot mutate stored metadata or the recovery base outside a command', () => {
  const store = new DocumentStore(fixture());
  const before = store.checkpoint();
  const snapshot = store.document;
  (snapshot.futureMetadata as any).nested.push('untracked mutation');
  (snapshot.pages[0].futureMetadata as any).nested.push('untracked page mutation');
  (snapshot.folders[0].futureMetadata as any).nested.push('untracked folder mutation');
  expect(store.checkpoint()).toEqual(before);
  expect(store.revision).toBe(0);
});

test('legacy documents without metadata initialize safe scene reads through every public load path', () => {
  const legacy: any = blankDocument();
  delete legacy.comments;
  delete legacy.folders;
  delete legacy.libraries;
  delete legacy.pages[0].folderId;
  const expected = validateDocument(legacy);
  for (const store of [
    new DocumentStore(legacy),
    DocumentStore.fromCheckpoint({ document: legacy }),
    DocumentStore.fromCheckpoint({
      checkpointVersion: 2,
      base: legacy,
      document: legacy,
      journal: [],
    }),
  ]) {
    expect(store.document).toEqual(expected);
    expect(store.checkpoint().document).toEqual(expected);
    store.transact({
      documentId: expected.id,
      expectedRevision: 0,
      requestId: uid(),
      operations: [{ type: 'document.rename', name: 'Legacy edited' }],
    });
    const recovered = DocumentStore.fromCheckpoint(JSON.parse(JSON.stringify(store.checkpoint())));
    expect(recovered.document.name).toBe('Legacy edited');
    recovered.undo();
    expect(recovered.document).toEqual(expected);
  }
});
