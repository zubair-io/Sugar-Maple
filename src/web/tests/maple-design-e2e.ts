import { chromium, expect } from '@playwright/test';
import { maplePhone } from './fixtures/maple-phone';
import { strict as assert } from 'node:assert';
import { mkdirSync } from 'node:fs';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
await page.goto('http://127.0.0.1:4200');
await page.waitForFunction(() => window.sugarMaple.ready);
const initial = await page.evaluate(() => window.sugarMaple.dispatch('document.get'));
const operations = maplePhone(initial.document.pages[0].id);
await page.evaluate(
  async ({ d, operations }) => {
    const s = window.sugarMaple;
    await s.dispatch('transaction.apply', {
      documentId: d.documentId,
      expectedRevision: d.revision,
      requestId: crypto.randomUUID(),
      operations,
    });
    await s.dispatch('selection.set', { id: 'maple-phone-screen' });
    await s.dispatch('viewport.fit');
  },
  { d: initial, operations },
);
await expect(page.locator('[data-node-id]')).toHaveCount(operations.length);
assert.equal(await page.locator('[data-node-id="maple-phone-screen"] img').count(), 0);
const sky = await page
  .locator('[data-node-id="maple-phone-hero-sky"]')
  .evaluate((e) => getComputedStyle(e).backgroundImage);
assert.ok(sky.includes('linear-gradient'));
const glow = await page
  .locator('[data-node-id="maple-phone-hero-glow"]')
  .evaluate((e) => getComputedStyle(e).backgroundImage);
assert.ok(glow.includes('radial-gradient'));
mkdirSync('build/evidence', { recursive: true });
await page
  .locator('[data-node-id="maple-phone-screen"]')
  .screenshot({ path: 'build/evidence/maple-phone-recreated.png' });
const svg = await page.evaluate(() =>
  window.sugarMaple.dispatch('code.export', { id: 'maple-phone-screen', target: 'svg' }),
);
assert.ok(svg.code.includes('<radialGradient'));
await Bun.write('build/evidence/maple-phone.svg', svg.code);
const png = await Bun.file('build/evidence/maple-phone-recreated.png').arrayBuffer();
const difference = await page.evaluate(
  async ({ svg, png }) => {
    async function pixels(src: string) {
      const image = new Image();
      image.src = src;
      await image.decode();
      const c = document.createElement('canvas');
      c.width = 402;
      c.height = 874;
      const context = c.getContext('2d')!;
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, 402, 874).data;
    }
    const a = await pixels('data:image/png;base64,' + png),
      b = await pixels('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
    let total = 0,
      count = 0;
    for (let y = 320; y < 490; y++)
      for (let x = 24; x < 378; x++)
        for (let c = 0; c < 3; c++) {
          total += Math.abs(a[(y * 402 + x) * 4 + c] - b[(y * 402 + x) * 4 + c]);
          count++;
        }
    return total / count;
  },
  { svg: svg.code, png: Buffer.from(png).toString('base64') },
);
assert.ok(difference < 3, `Gradient SVG/CSS mean channel error ${difference} exceeds 3/255`);

await page.evaluate(async () => {
  const s = window.sugarMaple,
    d = await s.dispatch('document.get');
  await s.dispatch('transaction.apply', {
    documentId: d.documentId,
    expectedRevision: d.revision,
    requestId: crypto.randomUUID(),
    operations: [
      { type: 'node.update', id: 'maple-phone-filename', patch: { text: 'EDITED.CR3' } },
    ],
  });
});
await expect(page.locator('[data-node-id="maple-phone-filename"]')).toHaveText('EDITED.CR3');
await page.reload();
await page.waitForFunction(() => window.sugarMaple.ready);
await page.keyboard.press('Meta+z');
await expect(page.locator('[data-node-id="maple-phone-filename"]')).toHaveText('IMG_1044.CR3');
await browser.close();
console.log(
  `PASS: Maple phone design reconstructed as ${operations.length} editable nodes, gradients/path geometry exported, text edit recovered and undone`,
);
