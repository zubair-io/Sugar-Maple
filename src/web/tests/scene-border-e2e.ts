import { chromium } from '@playwright/test';
import { strict as assert } from 'node:assert';
import { sceneBorderFixture } from '../../../tools/scene-border-fixture';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } }),
    errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:4200');
  await page.waitForFunction(() => window.sugarMaple.ready);
  await page.evaluate(async (nodes) => {
    const d = await window.sugarMaple.dispatch('document.get');
    await window.sugarMaple.dispatch('transaction.apply', {
      documentId: d.documentId,
      expectedRevision: d.revision,
      requestId: crypto.randomUUID(),
      operations: nodes.map((node) => ({
        type: 'node.add',
        node: { ...node, pageId: d.document.pages[0].id },
      })),
    });
  }, sceneBorderFixture().document.nodes);
  await page.addScriptTag({ content: await Bun.file('tools/scene-border-page.js').text() });
  const result = await page.evaluate(() => (window as any).canvasTransformAcceptance());
  assert.equal(result.passed, true);
  assert.equal(result.checks, 5);
  assert.deepEqual(errors, []);
  await Bun.write('build/scene-border-chrome.json', JSON.stringify(result, null, 2));
  await page.screenshot({ path: 'build/scene-border-chrome.png' });
  console.log(
    'PASS: five real Chrome Canvas/semantic/HTML/CSS free/stack/grid fractional-border geometry and undo cases at unchanged .1-point tolerance',
  );
} finally {
  await browser.close();
}
