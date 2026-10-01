import { clickNode, nodeBox, expectSceneCount, expectSelectionCount } from './canvas-browser';
import { chromium, expect } from '@playwright/test';
import { strict as assert } from 'node:assert';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto('http://127.0.0.1:4200');
await page.waitForFunction(() => window.sugarMaple.ready);
await page.evaluate(async () => {
  const s = window.sugarMaple,
    d = await s.dispatch('document.get');
  await s.dispatch('transaction.apply', {
    documentId: d.documentId,
    expectedRevision: d.revision,
    requestId: crypto.randomUUID(),
    operations: [
      {
        type: 'node.add',
        node: {
          id: 'first',
          pageId: d.document.pages[0].id,
          kind: 'rectangle',
          name: 'First',
          x: 40,
          y: 40,
          width: 100,
          height: 100,
        },
      },
      {
        type: 'node.add',
        node: {
          id: 'second',
          pageId: d.document.pages[0].id,
          kind: 'rectangle',
          name: 'Second',
          x: 200,
          y: 40,
          width: 100,
          height: 100,
        },
      },
    ],
  });
});
await clickNode(page, 'first');
await clickNode(page, 'second', true);
await expectSelectionCount(page, 2);
const a = await nodeBox(page, 'first');
await page.mouse.move(a.x + 10, a.y + 10);
await page.mouse.down();
await page.mouse.move(a.x + 50, a.y + 30, { steps: 5 });
await page.mouse.up();
let doc = (await page.evaluate(() => window.sugarMaple.dispatch('document.get'))).document;
assert.equal(doc.nodes.find((n: any) => n.id === 'first').x, 90);
assert.equal(doc.nodes.find((n: any) => n.id === 'second').x, 250);
await page.getByRole('button', { name: 'Group selection', exact: true }).click();
doc = (await page.evaluate(() => window.sugarMaple.dispatch('document.get'))).document;
const group = doc.nodes.find((n: any) => n.name === 'Group');
assert.equal(group.fillEnabled, false);
assert.equal(doc.nodes.find((n: any) => n.id === 'first').parentId, group.id);
await page.keyboard.press('Meta+z');
await page.getByRole('button', { name: 'Layers', exact: true }).click();
await expect(page.locator('.layer-row')).toHaveCount(2);
await page.keyboard.press('Meta+z');
doc = (await page.evaluate(() => window.sugarMaple.dispatch('document.get'))).document;
assert.equal(doc.nodes.find((n: any) => n.id === 'first').x, 40);
assert.equal(doc.nodes.find((n: any) => n.id === 'second').x, 200);
const viewport = (await page.locator('.viewport').boundingBox())!;
await page.mouse.move(viewport.x + 10, viewport.y + 10);
await page.mouse.down();
await page.mouse.move(viewport.x + 260, viewport.y + 125, { steps: 5 });
await page.mouse.up();
await expectSelectionCount(page, 2);
await page.keyboard.press('Delete');
await expectSceneCount(page, 0);
await page.keyboard.press('Meta+z');
await expectSceneCount(page, 2);
await browser.close();
console.log(
  'PASS: Shift selection, grouped pointer move, transparent group, independent undo, marquee, delete and restore',
);
