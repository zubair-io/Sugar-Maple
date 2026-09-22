import { test, expect } from 'bun:test';
import { DocumentStore } from '../src/app/model/store';
const tx = (s: DocumentStore, operations: any[]) =>
  s.transact({
    documentId: s.document.id,
    expectedRevision: s.revision,
    requestId: crypto.randomUUID(),
    operations,
  });
test('folders preserve page identity, links and undo across recovery; removal keeps contents', () => {
  const s = new DocumentStore(),
    page = s.document.pages[0].id;
  tx(s, [
    { type: 'folder.add', id: 'home', name: 'Home' },
    { type: 'page.update', id: page, folderId: 'home', name: 'Overview' },
    { type: 'page.add', id: 'detail', name: 'Details', folderId: 'home' },
  ]);
  tx(s, [{ type: 'folder.update', id: 'home', name: 'Main screens' }]);
  const restored = DocumentStore.fromCheckpoint(s.checkpoint());
  expect(restored.document.pages[0]).toMatchObject({
    id: page,
    name: 'Overview',
    folderId: 'home',
  });
  tx(restored, [{ type: 'folder.remove', id: 'home' }]);
  expect(restored.document.pages).toHaveLength(2);
  expect(restored.document.pages.every((p) => p.folderId === null)).toBe(true);
  restored.undo();
  expect(restored.document.folders[0].name).toBe('Main screens');
  expect(restored.document.pages.every((p) => p.folderId === 'home')).toBe(true);
  const before = restored.document;
  expect(() => tx(restored, [{ type: 'page.update', id: page, folderId: 'missing' }])).toThrow(
    'Missing page folder',
  );
  expect(restored.document).toEqual(before);
  expect(() => tx(restored, [{ type: 'folder.add', id: 'home', name: 'Duplicate' }])).toThrow(
    'Duplicate',
  );
});
test('legacy checkpoints and journals without folder fields reopen with unfiled pages', () => {
  const s = new DocumentStore();
  tx(s, [{ type: 'page.add', name: 'Legacy' }]);
  const cp: any = s.checkpoint();
  for (const doc of [cp.base, cp.document]) {
    delete doc.folders;
    doc.pages.forEach((p: any) => delete p.folderId);
  }
  cp.journal.forEach((e: any) => {
    if (e.delta) {
      delete e.delta.folders;
      delete e.delta.removedFolders;
      e.delta.pages.forEach((p: any) => delete p.folderId);
    }
  });
  const restored = DocumentStore.fromCheckpoint(cp);
  expect(restored.document.folders).toEqual([]);
  expect(restored.document.pages.every((p) => p.folderId === null)).toBe(true);
  restored.undo();
  expect(restored.document.pages).toHaveLength(1);
});
