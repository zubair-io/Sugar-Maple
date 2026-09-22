import { chromium, expect } from '@playwright/test';
import { strict as assert } from 'node:assert';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
await page.addInitScript(() => {
  (window as any).fileCalls = [];
  window.webkit = {
    messageHandlers: {
      native: {
        postMessage: async (message: any) => {
          (window as any).fileCalls.push(message);
          switch (message.action) {
            case 'recovery.load':
              return null;
            case 'status':
              return { status: 'Native bridge fixture' };
            case 'file.open':
              return { cancelled: true };
            default:
              return { ok: true };
          }
        },
      },
    },
  };
});
await page.goto('http://127.0.0.1:4200');
await page.waitForFunction(() => window.sugarMaple.ready);
for (const name of ['New', 'Open', 'Save', 'Save As'])
  await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
await page.getByRole('button', { name: 'Add page', exact: true }).click();
const before = await page.evaluate(() => window.sugarMaple.dispatch('document.get'));
// Page-only documents must be protected even when they contain no canvas nodes.
page.once('dialog', (dialog) => dialog.dismiss());
await page.evaluate(() => window.sugarMaple.fileCommand('new'));
assert.deepEqual(
  (await page.evaluate(() => window.sugarMaple.dispatch('document.get'))).document,
  before.document,
);
page.once('dialog', (dialog) => dialog.dismiss());
await page.evaluate(() => window.sugarMaple.fileCommand('open'));
assert.equal(
  await page.evaluate(
    () => (window as any).fileCalls.filter((c: any) => c.action === 'file.open').length,
  ),
  0,
);
await page.evaluate(() => window.sugarMaple.fileCommand('save'));
await page.evaluate(() => window.sugarMaple.fileCommand('saveAs'));
const saves = await page.evaluate(() =>
  (window as any).fileCalls.filter((c: any) => c.action === 'file.save'),
);
assert.equal(saves.length, 2);
assert.equal(saves[0].saveAs, false);
assert.equal(saves[1].saveAs, true);
assert.deepEqual(saves[0].value.document, before.document);
await page.keyboard.press('Meta+s');
assert.equal(
  await page.evaluate(
    () => (window as any).fileCalls.filter((c: any) => c.action === 'file.save').length,
  ),
  2,
);
await page.evaluate(() => window.sugarMaple.fileCommand('open'));
assert.deepEqual(
  (await page.evaluate(() => window.sugarMaple.dispatch('document.get'))).document,
  before.document,
);
await page.evaluate(() => window.sugarMaple.fileCommand('new'));
const after = await page.evaluate(() => window.sugarMaple.dispatch('document.get'));
assert.notEqual(after.document.id, before.document.id);
assert.equal(after.document.pages.length, 1);
await page.screenshot({ path: 'build/evidence/native-file-menu-editor.png' });
await browser.close();
console.log(
  'PASS: native toolbar hidden, shared New/Open/Save/Save As routing, dirty page-only cancellation, cancelled picker preservation, no duplicate native save shortcut (stubbed native I/O)',
);
