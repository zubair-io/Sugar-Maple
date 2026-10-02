import { chromium } from '@playwright/test';
import { strict as assert } from 'node:assert';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  await page.goto(process.env.SUGAR_MAPLE_TEST_URL ?? 'http://127.0.0.1:4200');
  await page.waitForFunction(() => window.sugarMaple.ready);
  const script = await Bun.file('tools/document-snapshot-page.js').text();
  const report = await page.evaluate(script + '\nwindow.canvasTransformAcceptance()');
  assert.equal(report.passed, true);
  assert.equal(report.checks, 7);
  await Bun.write('build/evidence/document-snapshot-chrome.json', JSON.stringify(report, null, 2));
  await page.screenshot({ path: 'build/evidence/document-snapshot-chrome.png' });
  await page.evaluate(() => window.sugarMaple.flushAutosave());
  await page.reload();
  await page.waitForFunction(() => window.sugarMaple.ready);
  assert.deepEqual(
    (await page.evaluate(() => window.sugarMaple.dispatch('document.get'))).document,
    report.document,
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
  assert.equal(undone.document.nodes.length, 0);
  assert.equal(undone.document.comments.length, 0);
  assert.equal(undone.document.folders.length, 0);
  console.log(
    'PASS: four public read snapshots cannot mutate scene/history; exact undo/redo and real IndexedDB reload/recovered undo',
  );
} finally {
  await browser.close();
}
