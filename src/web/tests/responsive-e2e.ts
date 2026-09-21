import { chromium, expect } from '@playwright/test';
import { strict as assert } from 'node:assert';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto('http://127.0.0.1:4200');
await page.waitForFunction(() => window.sugarMaple.ready);
const before = await page.evaluate(async () => {
  const s = window.sugarMaple;
  const d = await s.dispatch('document.get');
  return s.dispatch('transaction.apply', {
    documentId: d.documentId,
    requestId: crypto.randomUUID(),
    expectedRevision: d.revision,
    operations: [
      {
        type: 'node.add',
        node: {
          id: 'board',
          pageId: d.document.pages[0].id,
          kind: 'artboard',
          name: 'Responsive screen',
          width: 834,
          height: 600,
          layout: 'vertical',
          padding: 20,
          gap: 16,
        },
      },
      {
        type: 'node.add',
        node: {
          id: 'heading',
          pageId: d.document.pages[0].id,
          parentId: 'board',
          kind: 'text',
          text: 'Welcome',
          widthMode: 'fill',
          height: 50,
        },
      },
      {
        type: 'node.add',
        node: {
          id: 'action',
          pageId: d.document.pages[0].id,
          parentId: 'board',
          kind: 'button',
          text: 'Next',
          widthMode: 'fill',
          height: 44,
          targetId: 'destination',
        },
      },
      {
        type: 'node.add',
        node: {
          id: 'destination',
          pageId: d.document.pages[0].id,
          kind: 'artboard',
          name: 'Destination',
          x: 1000,
          width: 834,
          height: 600,
        },
      },
    ],
  });
});
await page.evaluate(() => window.sugarMaple.dispatch('selection.set', { id: 'board' }));
await page.getByRole('button', { name: '▶ Preview' }).click();
await page.getByLabel('Preview viewport').selectOption({ label: 'Mobile · 393' });
const button = page.locator('.preview-stage [data-node-id="action"]');
assert.equal(Math.round((await button.boundingBox())!.width), 353);
await button.click();
await expect(page.locator('.preview-backdrop strong')).toContainText('Destination');
await page.getByRole('button', { name: 'Back', exact: true }).click();
await expect(page.locator('.preview-backdrop strong')).toContainText('Responsive screen');
await page.getByRole('button', { name: 'Close preview' }).click();
const after = await page.evaluate(() => window.sugarMaple.dispatch('document.get'));
assert.equal(after.revision, before.revision);
assert.equal(after.document.nodes.find((n: any) => n.id === 'board').width, 834);
await page.waitForFunction(async () => {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open('sugar-maple', 1);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  const saved: any = await new Promise((resolve) => {
    const r = db.transaction('checkpoints').objectStore('checkpoints').get('active');
    r.onsuccess = () => resolve(r.result);
  });
  db.close();
  return saved?.document.nodes.length === 4;
});
await page.reload();
await page.waitForFunction(() => window.sugarMaple.ready);
assert.equal(
  (await page.evaluate(() => window.sugarMaple.dispatch('document.get'))).document.nodes.length,
  4,
);
assert.equal(await page.evaluate(() => localStorage.getItem('sugar-maple-recovery')), null);
await browser.close();
console.log(
  'PASS: responsive stack at mobile width, preview navigation/back without document mutation, real IndexedDB recovery',
);
