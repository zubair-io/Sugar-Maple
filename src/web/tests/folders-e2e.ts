import { chromium, expect } from '@playwright/test';
import { strict as assert } from 'node:assert';
const b = await chromium.launch({ channel: 'chrome', headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
await p.goto('http://127.0.0.1:4200');
await p.waitForFunction(() => window.sugarMaple.ready);
await p.getByLabel('New folder name', { exact: true }).fill('Home');
await p.getByRole('button', { name: 'Add folder', exact: true }).click();
await p.getByLabel('Page folder', { exact: true }).selectOption({ label: 'Home' });
await p.getByRole('button', { name: 'Toggle folder Home', exact: true }).click();
await expect(p.getByRole('button', { name: '▤ Page 1', exact: true })).toHaveCount(0);
await p.getByRole('button', { name: 'Toggle folder Home', exact: true }).click();
await expect(p.getByRole('button', { name: '▤ Page 1', exact: true })).toBeVisible();
await p.getByRole('button', { name: 'Add page', exact: true }).click();
let d = await p.evaluate(() => window.sugarMaple.dispatch('document.get'));
assert.equal(d.document.pages[0].folderId, d.document.pages[1].folderId);
await p.getByLabel('Rename folder Home', { exact: true }).fill('Main screens');
await p.getByLabel('Rename folder Home', { exact: true }).blur();
await p.waitForFunction(
  () =>
    new Promise<boolean>((resolve, reject) => {
      const request = indexedDB.open('sugar-maple', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const read = db.transaction('checkpoints').objectStore('checkpoints').get('active');
        read.onsuccess = () => {
          const doc = read.result?.document;
          db.close();
          resolve(
            doc?.folders.some((f: any) => f.name === 'Main screens') && doc.pages.length === 2,
          );
        };
        read.onerror = () => {
          db.close();
          reject(read.error);
        };
      };
    }),
);
await p.reload();
await p.waitForFunction(() => window.sugarMaple.ready);
await expect(
  p.getByRole('button', { name: 'Toggle folder Main screens', exact: true }),
).toBeVisible();
await p.getByRole('button', { name: 'Remove folder Main screens', exact: true }).click();
await expect(p.getByRole('button', { name: '▤ Page 1', exact: true })).toBeVisible();
await p.keyboard.press('Meta+z');
await expect(
  p.getByRole('button', { name: 'Toggle folder Main screens', exact: true }),
).toBeVisible();
await p.getByRole('button', { name: '▤ Page 2', exact: true }).click();
await p.getByRole('button', { name: 'Layers', exact: true }).click();
await expect(p.getByRole('button', { name: 'Add page', exact: true })).toHaveCount(0);
await expect(p.getByRole('button', { name: 'Browse pages', exact: true })).toContainText('Page 2');
await p.getByLabel('Find layer', { exact: true }).fill('heading');
await p.getByRole('button', { name: 'Browse pages', exact: true }).click();
await expect(p.getByRole('button', { name: 'Pages', exact: true })).toHaveAttribute('aria-pressed', 'true');
await p.getByRole('button', { name: 'Tokens', exact: true }).click();
await p.getByRole('button', { name: 'Layers', exact: true }).click();
await expect(p.getByLabel('Find layer', { exact: true })).toHaveValue('heading');
await p.getByRole('button', { name: 'Pages', exact: true }).click();
await p.screenshot({ path: 'build/evidence/page-folders-browser.png' });
await b.close();
console.log(
  'PASS: create/move/collapse/rename folders, inherit folder for new pages, reload and undo folder removal without deleting pages',
);
