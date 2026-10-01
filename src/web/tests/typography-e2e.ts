import { chromium, expect } from '@playwright/test';
import { strict as assert } from 'node:assert';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  await page.goto('http://127.0.0.1:4200');
  await page.waitForFunction(() => window.sugarMaple.ready);
  await page.evaluate(async () => {
    const d = await window.sugarMaple.dispatch('document.get'),
      pageId = d.document.pages[0].id;
    const nodes = [
      {
        id: 'board',
        kind: 'artboard',
        layout: 'vertical',
        width: 800,
        height: 1400,
        padding: 20,
        gap: 16,
      },
      {
        id: 'latin',
        text: 'Design for clarity. Long labels wrap without changing authored font metrics. '.repeat(
          3,
        ),
        fontFamily: 'Maple Sans',
        fontWeight: 650,
        letterSpacing: 0.7,
        textAlign: 'center',
        lineHeight: 1.6,
      },
      {
        id: 'unicode',
        text: 'Café — Ελληνικά — Русский\n日本語 中文 العربية हिन्दी 👩🏽‍💻',
        fontFamily: 'Maple Sans',
        letterSpacing: 0,
        textAlign: 'right',
        lineHeight: 1.7,
      },
      {
        id: 'mono',
        text: 'One line\nSecond line',
        fontFamily: 'monospace',
        letterSpacing: 2,
        lineHeight: 1.4,
      },
    ];
    await window.sugarMaple.dispatch('transaction.apply', {
      documentId: d.documentId,
      expectedRevision: d.revision,
      requestId: crypto.randomUUID(),
      operations: nodes.map((n, i) => ({
        type: 'node.add',
        node: {
          ...n,
          pageId,
          ...(i
            ? {
                kind: 'text',
                parentId: 'board',
                fontSize: 20,
                widthMode: 'fill',
                heightMode: 'hug',
              }
            : {}),
        },
      })),
    });
  });
  const results: any[] = [];
  for (const width of [1440, 834, 393]) {
    await page.evaluate(async (width) => {
      const d = await window.sugarMaple.dispatch('document.get');
      await window.sugarMaple.dispatch('transaction.apply', {
        documentId: d.documentId,
        expectedRevision: d.revision,
        requestId: crypto.randomUUID(),
        operations: [{ type: 'node.update', id: 'board', patch: { width } }],
      });
      await window.sugarMaple.dispatch('selection.set', { id: 'board' });
      await window.sugarMaple.dispatch('viewport.fit');
      const current = await window.sugarMaple.dispatch('document.get');
      await window.sugarMaple.dispatch('render.ready', {
        documentId: current.documentId,
        expectedRevision: current.revision,
      });
    }, width);
    const canvas = await page.evaluate(async (width) => {
      const layout = await window.sugarMaple.dispatch('layout.inspect'),
        root = layout.nodes.find((n: any) => n.id === 'board').bounds,
        scale = root.width / width;
      return Object.fromEntries(
        layout.nodes.map((n: any) => [
          n.id,
          {
            x: (n.bounds.x - root.x) / scale,
            y: (n.bounds.y - root.y) / scale,
            width: n.bounds.width / scale,
            height: n.bounds.height / scale,
          },
        ]),
      );
    }, width);
    await page.getByRole('button', { name: '▶ Preview' }).click();
    await expect(page.locator('.preview-stage [data-node-id="board"]')).toBeVisible();
    const preview = await page.locator('.preview-stage').evaluate((el, width) => {
      const root = el.querySelector('[data-node-id="board"]')!.getBoundingClientRect(),
        scale = root.width / width;
      return Object.fromEntries(
        [...el.querySelectorAll('[data-node-id]')].map((n) => {
          const b = n.getBoundingClientRect();
          return [
            n.getAttribute('data-node-id'),
            {
              x: (b.x - root.x) / scale,
              y: (b.y - root.y) / scale,
              width: b.width / scale,
              height: b.height / scale,
            },
          ];
        }),
      );
    }, width);
    let maxDelta = 0;
    for (const [id, b] of Object.entries(canvas))
      for (const key of ['x', 'y', 'width', 'height']) {
        const delta = Math.abs((b as any)[key] - preview[id][key]);
        maxDelta = Math.max(maxDelta, delta);
        assert.ok(
          delta < 1,
          `${width} ${id}.${key}: canvas ${(b as any)[key]}, preview ${preview[id][key]}`,
        );
      }
    results.push({ width, maxDelta });
    await page.keyboard.press('Escape');
  }
  await page.evaluate(() => window.sugarMaple.dispatch('selection.set', { id: 'latin' }));
  await expect(page.getByLabel('Font family', { exact: true })).toHaveValue('Maple Sans');
  await page.getByLabel('Font family', { exact: true }).fill('Maple Missing Font 12345');
  await page.getByLabel('Font family', { exact: true }).press('Tab');
  await expect(page.locator('font-inspector [role="alert"]')).toContainText('unavailable');
  await page
    .getByLabel('Font family', { exact: true })
    .fill(process.platform === 'darwin' ? 'Helvetica' : 'Liberation Sans');
  await page.getByLabel('Font family', { exact: true }).press('Tab');
  await expect(page.locator('font-inspector')).toContainText('Local font available');
  await page.getByLabel('Font family', { exact: true }).fill('Maple Sans');
  await page.getByLabel('Font family', { exact: true }).press('Tab');
  await page.getByLabel('Line height', { exact: true }).fill('1.8');
  await page.getByLabel('Line height', { exact: true }).press('Tab');
  await page.getByLabel('Letter spacing', { exact: true }).fill('1.1');
  await page.getByLabel('Letter spacing', { exact: true }).press('Tab');
  await page.getByLabel('Text alignment', { exact: true }).selectOption('left');
  const d = await page.evaluate(() => window.sugarMaple.dispatch('document.get')),
    n = d.document.nodes.find((n: any) => n.id === 'latin');
  assert.deepEqual(
    [n.fontFamily, n.lineHeight, n.letterSpacing, n.textAlign],
    ['Maple Sans', 1.8, 1.1, 'left'],
  );
  console.log(
    'PASS typography: 1 CSS-pixel geometry tolerance; bundled/local/missing font diagnostics; inspector authoring',
    JSON.stringify(results),
  );
} finally {
  await browser.close();
}
