import { editorURL } from './editor-url';
import { chromium, expect } from '@playwright/test';
import { strict as assert } from 'node:assert';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(editorURL());
  await page.waitForFunction(() => window.sugarMaple.ready);
  await page.evaluate(async () => {
    const d = await window.sugarMaple.dispatch('document.get'),
      pageId = d.document.pages[0].id;
    const nodes = [
      {
        id: 'board',
        kind: 'artboard',
        width: 800,
        height: 900,
        layout: 'vertical',
        padding: 20,
        strokeWidth: 2,
        gap: 12,
        x: 0,
        y: 0,
      },
      {
        id: 'row',
        parentId: 'board',
        kind: 'frame',
        widthMode: 'fill',
        height: 120,
        layout: 'horizontal',
        padding: 8,
        strokeWidth: 1,
        gap: 10,
      },
      {
        id: 'fixed',
        parentId: 'row',
        kind: 'text',
        width: 120,
        heightMode: 'hug',
        text: 'Two lines\nand one more',
        fontSize: 20,
      },
      { id: 'flex', parentId: 'row', kind: 'frame', widthMode: 'fill', heightMode: 'fill' },
      {
        id: 'grid',
        parentId: 'board',
        kind: 'frame',
        widthMode: 'fill',
        height: 200,
        layout: 'grid',
        columns: 2,
        gap: 12,
        padding: 10,
        strokeWidth: 1,
      },
      {
        id: 'percent',
        parentId: 'grid',
        kind: 'rectangle',
        widthMode: 'percent',
        widthPercent: 50,
        height: 40,
      },
      {
        id: 'grid-fill',
        parentId: 'grid',
        kind: 'rectangle',
        widthMode: 'fill',
        heightMode: 'fill',
      },
      { id: 'grid-fixed', parentId: 'grid', kind: 'rectangle', width: 60, height: 70 },
      {
        id: 'grid-hug',
        parentId: 'grid',
        kind: 'text',
        widthMode: 'hug',
        heightMode: 'hug',
        fontSize: 16,
        text: 'Intrinsic label',
      },
      {
        id: 'hug',
        parentId: 'board',
        kind: 'frame',
        layout: 'horizontal',
        widthMode: 'hug',
        heightMode: 'hug',
        padding: 8,
        gap: 6,
      },
      {
        id: 'hug-label',
        parentId: 'hug',
        kind: 'text',
        widthMode: 'hug',
        heightMode: 'hug',
        fontSize: 18,
        text: 'Measure me',
      },
      { id: 'hug-box', parentId: 'hug', kind: 'rectangle', width: 35, height: 25 },
      {
        id: 'free',
        parentId: 'board',
        kind: 'frame',
        widthMode: 'fill',
        height: 180,
        layout: 'free',
        padding: 20,
        strokeWidth: 3,
      },
      { id: 'absolute', parentId: 'free', kind: 'rectangle', x: 10, y: 15, width: 50, height: 40 },
      {
        id: 'input',
        parentId: 'free',
        kind: 'input',
        x: 100,
        y: 20,
        width: 200,
        height: 44,
        text: 'Email address',
      },
      { id: 'stack', parentId: 'board', kind: 'frame', widthMode: 'fill', height: 160, layout: 'vertical', padding: 4, gap: 8 },
      { id: 'wrapped-hug', parentId: 'stack', kind: 'text', widthMode: 'fill', heightMode: 'hug', fontSize: 16, text: 'A sentence that wraps at the resolved container width. '.repeat(7) },
      { id: 'remaining-height', parentId: 'stack', kind: 'rectangle', widthMode: 'fill', heightMode: 'fill' },
    ];
    await window.sugarMaple.dispatch('transaction.apply', {
      documentId: d.documentId,
      expectedRevision: d.revision,
      requestId: crypto.randomUUID(),
      operations: nodes.map((node) => ({ type: 'node.add', node: { ...node, pageId } })),
    });
    await window.sugarMaple.dispatch('selection.set', { id: 'board' });
    await window.sugarMaple.dispatch('viewport.fit');
  });
  const design = await page.evaluate(async () => {
    const layout = await window.sugarMaple.dispatch('layout.inspect'),
      root = layout.nodes.find((n: any) => n.id === 'board').bounds;
    const scale = root.width / 800;
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
  });
  await page.getByRole('button', { name: '▶ Preview' }).click();
  await expect(page.locator('.preview-stage [data-node-id="board"]')).toBeVisible();
  const preview = await page.locator('.preview-stage').evaluate((el) => {
    const root = el.querySelector('[data-node-id="board"]')!.getBoundingClientRect(),
      scale = root.width / 800;
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
  });
  for (const [id, box] of Object.entries(design))
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      assert.ok(
        Math.abs((box as any)[key] - (preview as any)[id][key]) < 1,
        `${id}.${key}: canvas ${(box as any)[key]}, DOM ${(preview as any)[id][key]}`,
      );
    }
  console.log(
    'PASS: actual canvas and native DOM preview geometry agree for free, stack, grid, border/padding, fixed/fill/hug/percent and text measurement',
  );
} finally {
  await browser.close();
}
