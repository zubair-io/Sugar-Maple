import { chromium } from '@playwright/test';
import { strict as assert } from 'node:assert';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4200');
  await page.waitForFunction(() => window.sugarMaple.ready);
  await page.evaluate(() => window.sugarMaple.flushAutosave());
  // Seed an actual IndexedDB checkpoint as if a newer compatible editor saved it.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('sugar-maple', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction('checkpoints', 'readwrite'),
            store = tx.objectStore('checkpoints');
          const read = store.get('active');
          read.onsuccess = () => {
            const checkpoint = read.result;
            for (const doc of [checkpoint.document, checkpoint.base]) {
              doc.futureMetadata = { nested: [null, true, 2, { label: 'Preserve me' }] };
              doc.folders = [
                { id: 'folder', name: 'Folder', order: 0, futureMetadata: { preserve: true } },
              ];
              doc.pages[0].folderId = 'folder';
              doc.pages[0].futureMetadata = { preserve: true };
            }
            store.put(checkpoint, 'active');
            store.put(checkpoint, 'document:' + checkpoint.document.id);
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
  );
  await page.reload();
  await page.waitForFunction(() => window.sugarMaple.ready);
  const restored = await page.evaluate(() => window.sugarMaple.dispatch('document.get'));
  assert.deepEqual(restored.document.futureMetadata, {
    nested: [null, true, 2, { label: 'Preserve me' }],
  });
  assert.deepEqual(restored.document.pages[0].futureMetadata, { preserve: true });
  assert.deepEqual(restored.document.folders[0].futureMetadata, { preserve: true });
  await page.evaluate(async () => {
    const d = await window.sugarMaple.dispatch('document.get');
    await window.sugarMaple.dispatch('transaction.apply', {
      documentId: d.documentId,
      expectedRevision: d.revision,
      requestId: crypto.randomUUID(),
      operations: [
        { type: 'document.rename', name: 'Metadata retained' },
        { type: 'page.update', id: d.document.pages[0].id, name: 'Renamed page' },
        { type: 'folder.update', id: 'folder', name: 'Renamed folder' },
      ],
    });
    await window.sugarMaple.flushAutosave();
  });
  await page.reload();
  await page.waitForFunction(() => window.sugarMaple.ready);
  const edited = await page.evaluate(() => window.sugarMaple.dispatch('document.get'));
  assert.equal(edited.document.name, 'Metadata retained');
  assert.deepEqual(edited.document.futureMetadata, restored.document.futureMetadata);
  assert.deepEqual(
    edited.document.pages[0].futureMetadata,
    restored.document.pages[0].futureMetadata,
  );
  assert.deepEqual(
    edited.document.folders[0].futureMetadata,
    restored.document.folders[0].futureMetadata,
  );
  await page.evaluate(async () => {
    const d = await window.sugarMaple.dispatch('document.get');
    await window.sugarMaple.dispatch('history.undo', {
      documentId: d.documentId,
      expectedRevision: d.revision,
    });
    await window.sugarMaple.flushAutosave();
  });
  await page.reload();
  await page.waitForFunction(() => window.sugarMaple.ready);
  const undone = await page.evaluate(() => window.sugarMaple.dispatch('document.get'));
  assert.deepEqual(undone.document, restored.document);
  console.log(
    'PASS: real IndexedDB preserves opaque document/page/folder metadata through restore, grouped edits, durable reload and recovered undo',
  );
} finally {
  await browser.close();
}
