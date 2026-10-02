import { chromium, expect } from '@playwright/test';
import { strict as assert } from 'node:assert';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://127.0.0.1:4200');
  await page.waitForFunction(() => window.sugarMaple.ready);
  await expect(page.locator('footer')).toContainText('Saved in this browser');
  const doc = () => page.evaluate(() => window.sugarMaple.dispatch('document.get'));
  await expect(page.getByLabel('Document name', { exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Untitled', exact: true }).dblclick();
  await page.getByLabel('Document name', { exact: true }).fill('First file');
  await page.getByLabel('Document name', { exact: true }).press('Enter');
  await expect(page.getByRole('tab', { name: 'First file', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add page', exact: true }).click();
  const first = await doc();
  await page.getByRole('button', { name: 'New file', exact: true }).click();
  await expect(page.getByRole('tablist', { name: 'Documents' }).getByRole('tab')).toHaveCount(2);
  const second = await doc();
  assert.notEqual(second.documentId, first.documentId);
  await page.getByRole('tab', { name: 'First file', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'First file', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  assert.deepEqual((await doc()).document, first.document);
  await page.getByRole('button', { name: '↶', exact: true }).click();
  assert.equal((await doc()).document.pages.length, 1);
  await page.getByRole('tab', { name: 'First file', exact: true }).press('F2');
  await page.getByLabel('Document name', { exact: true }).fill('Cancelled');
  await page.getByLabel('Document name', { exact: true }).press('Escape');
  assert.equal((await doc()).document.name, 'First file');
  await page.getByRole('button', { name: 'Close First file', exact: true }).click();
  await expect(page.getByRole('tablist', { name: 'Documents' }).getByRole('tab')).toHaveCount(1);
  assert.equal((await doc()).documentId, second.documentId);
  const saved = await page.evaluate(
    (id) =>
      new Promise<any>((resolve, reject) => {
        const req = indexedDB.open('sugar-maple', 1);
        req.onsuccess = () => {
          const db = req.result;
          const read = db
            .transaction('checkpoints')
            .objectStore('checkpoints')
            .get('document:' + id);
          read.onsuccess = () => {
            resolve(read.result);
            db.close();
          };
          read.onerror = () => reject(read.error);
        };
      }),
    first.documentId,
  );
  assert.equal(saved.document.name, 'First file');
  assert.equal(saved.document.pages.length, 1);
  for (const width of [1440, 1000]) {
    await page.setViewportSize({ width, height: 900 });
    const box = await page.getByRole('navigation', { name: 'Editor mode' }).boundingBox();
    assert.ok(box && Math.abs(box.x + box.width / 2 - width / 2) < 1);
  }
  await page.screenshot({ path: 'build/evidence/file-tabs-browser.png' });
  console.log(
    'PASS: tab creation, isolated content/undo, double-click/F2 rename, Escape, close preserves saved file, centered modes',
  );
} finally {
  await browser.close();
}
