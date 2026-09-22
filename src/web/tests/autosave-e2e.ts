import { chromium, expect } from '@playwright/test';
import { strict as assert } from 'node:assert';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:4200');
await page.waitForFunction(() => window.sugarMaple.ready);
await expect(page.locator('footer')).toContainText('Saved in this browser');
await page.getByRole('button', { name: 'Add page', exact: true }).click();
await expect(page.locator('footer')).toContainText('Saved in this browser');
const before = await page.evaluate(() => window.sugarMaple.dispatch('document.get'));
await page.getByRole('button', { name: 'New', exact: true }).click();
await expect(page.locator('footer')).toContainText('Saved in this browser');
const current = await page.evaluate(() => window.sugarMaple.dispatch('document.get'));
assert.notEqual(current.documentId, before.documentId);
const previous = await page.evaluate(
  (id) =>
    new Promise<any>((resolve, reject) => {
      const request = indexedDB.open('sugar-maple', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const read = db
          .transaction('checkpoints')
          .objectStore('checkpoints')
          .get('document:' + id);
        read.onsuccess = () => {
          db.close();
          resolve(read.result);
        };
        read.onerror = () => {
          db.close();
          reject(read.error);
        };
      };
    }),
  before.documentId,
);
assert.deepEqual(previous.document, before.document);
await page.getByRole('button', { name: 'Add comment', exact: true }).click();
await page.getByRole('button', { name: 'Place comment on canvas', exact: true }).press('Enter');
await page.getByLabel('New page comment', { exact: true }).fill('Autosaved feedback');
await page.getByRole('button', { name: 'Post comment', exact: true }).click();
await expect(page.locator('footer')).toContainText('Saved in this browser');
await page.evaluate(() => window.sugarMaple.flushAutosave());
await page.reload();
await page.waitForFunction(() => window.sugarMaple.ready);
const restored = await page.evaluate(() => window.sugarMaple.dispatch('document.get'));
assert.equal(restored.document.comments[0].messages[0].text, 'Autosaved feedback');
await page.screenshot({ path: 'build/evidence/autosave-browser.png' });
await browser.close();
console.log(
  'PASS: real IndexedDB autosave, New preserves previous document, posted feedback survives reload',
);
