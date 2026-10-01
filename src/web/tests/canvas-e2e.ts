import { chromium, expect } from '@playwright/test';
import { strict as assert } from 'node:assert';
import { nodeBox } from './canvas-browser';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:4200');
  await page.waitForFunction(() => window.sugarMaple.ready);
  const initial = await page.evaluate(() => window.sugarMaple.dispatch('document.get'));
  await page.evaluate(
    async (d) =>
      window.sugarMaple.dispatch('transaction.apply', {
        documentId: d.documentId,
        expectedRevision: d.revision,
        requestId: crypto.randomUUID(),
        operations: [
          { type: 'page.add', id: 'success-page', name: 'Success page' },
          {
            type: 'node.add',
            node: {
              id: 'board',
              pageId: d.document.pages[0].id,
              kind: 'artboard',
              name: 'Sign in',
              width: 400,
              height: 500,
              padding: 0,
            },
          },
          {
            type: 'node.add',
            node: {
              id: 'blue',
              pageId: d.document.pages[0].id,
              parentId: 'board',
              kind: 'rectangle',
              name: 'Blue',
              x: 20,
              y: 20,
              width: 100,
              height: 60,
              fill: '#2563eb',
            },
          },
          {
            type: 'node.add',
            node: {
              id: 'action',
              pageId: d.document.pages[0].id,
              parentId: 'board',
              kind: 'button',
              name: 'Sign in action',
              text: 'Continue',
              x: 20,
              y: 100,
              width: 200,
              height: 44,
              targetId: 'success',
              transition: 'dissolve',
            },
          },
          {
            type: 'node.add',
            node: {
              id: 'broken',
              pageId: d.document.pages[0].id,
              parentId: 'board',
              kind: 'image',
              name: 'Corrupt image',
              x: 20,
              y: 170,
              width: 200,
              height: 100,
              asset: 'data:image/png;base64,aGVsbG8=',
            },
          },
          {
            type: 'node.add',
            node: {
              id: 'success',
              pageId: 'success-page',
              kind: 'artboard',
              name: 'Success',
              width: 400,
              height: 500,
            },
          },
          {
            type: 'node.add',
            node: {
              id: 'offscreen',
              pageId: d.document.pages[0].id,
              kind: 'frame',
              x: 10000,
              width: 200,
              height: 200,
            },
          },
          {
            type: 'node.add',
            node: {
              id: 'clipped',
              pageId: d.document.pages[0].id,
              parentId: 'offscreen',
              kind: 'rectangle',
              x: -10000,
              width: 40,
              height: 40,
            },
          },
        ],
      }),
    initial,
  );
  const box = await nodeBox(page, 'blue');
  const rgb = await page.locator('.viewport canvas').evaluate((el, b) => {
    const canvas = el as HTMLCanvasElement,
      r = canvas.getBoundingClientRect(),
      scale = canvas.width / r.width;
    return Array.from(
      canvas
        .getContext('2d')!
        .getImageData(
          Math.round((b.x + b.width / 2 - r.x) * scale),
          Math.round((b.y + b.height / 2 - r.y) * scale),
          1,
          1,
        ).data,
    );
  }, box);
  assert.deepEqual(rgb, [37, 99, 235, 255]);
  const layout = await page.evaluate(() => window.sugarMaple.dispatch('layout.inspect'));
  assert.equal(layout.nodes.find((n: any) => n.id === 'clipped').rendered, true);
  assert.equal(layout.nodes.find((n: any) => n.id === 'clipped').painted, false);
  // Exercise the real component's pointer capture/cancel path, not only the tool.
  const beforeCancel = (await page.evaluate(() => window.sugarMaple.dispatch('document.get')))
    .revision;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2 + 30);
  await page
    .locator('.viewport canvas')
    .dispatchEvent('pointercancel', { pointerId: 1, isPrimary: true });
  await page.mouse.up();
  const afterCancel = await page.evaluate(() => window.sugarMaple.dispatch('document.get'));
  assert.equal(afterCancel.revision, beforeCancel);
  assert.equal(afterCancel.document.nodes.find((n: any) => n.id === 'blue').x, 20);
  await expect(page.locator('.viewport [data-node-id]')).toHaveCount(0);
  const ready = await page.evaluate(async () => {
    const d = await window.sugarMaple.dispatch('document.get');
    return window.sugarMaple.dispatch('render.ready', {
      documentId: d.documentId,
      expectedRevision: d.revision,
    });
  });
  assert.equal(ready.assetDiagnostics.find((a: any) => a.nodeId === 'broken').state, 'error');
  const invalid = await page.evaluate(async () => {
    try {
      await window.sugarMaple.dispatch('code.export', { id: 'board', target: 'png' });
      return null;
    } catch (error) {
      return window.sugarMaple.describeError(error);
    }
  });
  assert.equal(invalid.code, 'invalid_input');
  assert.equal(invalid.documentId, initial.documentId);
  await page.evaluate(() => window.sugarMaple.dispatch('selection.set', { id: 'action' }));
  await page.getByRole('button', { name: 'Prototype', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Navigate to' })).toHaveValue('success');
  await expect(
    page.getByRole('combobox', { name: 'Navigate to' }).locator('option[value="success"]'),
  ).toHaveText('Success page / Success');
  await expect(page.getByRole('combobox', { name: 'Transition' })).toHaveValue('dissolve');
  await page.evaluate(() => window.sugarMaple.dispatch('selection.set', { id: 'board' }));
  await page.getByRole('button', { name: '▶ Preview' }).click();
  await expect(page.getByRole('img', { name: 'Corrupt image: image decode failed' })).toBeVisible();
  const revision = (await page.evaluate(() => window.sugarMaple.dispatch('document.get'))).revision;
  await page.locator('.preview-stage [data-node-id="action"] button').click();
  const animation = await page
    .locator('preview-screen .from')
    .evaluate((el) => getComputedStyle(el).animationName);
  assert.ok(animation.includes('dissolve-out'));
  await expect(page.locator('.preview-backdrop strong')).toContainText('Success');
  await expect(page.locator('preview-screen .from')).toHaveCount(0);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.locator('.preview-backdrop strong')).toContainText('Sign in');
  await page.getByRole('button', { name: 'Close preview' }).click();
  assert.equal(
    (await page.evaluate(() => window.sugarMaple.dispatch('document.get'))).revision,
    revision,
  );
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.evaluate(() => window.sugarMaple.dispatch('selection.set', { id: 'broken' }));
  await expect(page.locator('asset-inspector [role="alert"]')).toContainText(
    'could not be decoded',
  );
  await page
    .getByLabel('Replace image', { exact: true })
    .setInputFiles({ name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('hello') });
  await expect(page.getByRole('alert').last()).toContainText('could not be decoded');
  assert.equal(
    (await page.evaluate(() => window.sugarMaple.dispatch('document.get'))).revision,
    revision,
  );
  const png = await page
    .locator('.viewport canvas')
    .evaluate((el) => (el as HTMLCanvasElement).toDataURL('image/png').split(',')[1]);
  await page.getByLabel('Replace image', { exact: true }).setInputFiles({
    name: 'valid.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  await expect(page.locator('asset-inspector [role="status"]')).toHaveText('Image ready');
  const repaired = await page.evaluate(() => window.sugarMaple.dispatch('document.get'));
  const image = repaired.document.nodes.find((n: any) => n.id === 'broken');
  assert.equal(repaired.revision, revision + 1);
  assert.equal(image.width, 200);
  assert.equal(image.height, 100);
  assert.equal(image.parentId, 'board');
  await page.evaluate(
    (d) =>
      window.sugarMaple.dispatch('history.undo', {
        documentId: d.documentId,
        expectedRevision: d.revision,
      }),
    repaired,
  );
  await expect(page.locator('asset-inspector [role="alert"]')).toContainText(
    'could not be decoded',
  );
  await page.screenshot({ path: 'build/evidence/integrated-canvas.png' });
  assert.deepEqual(errors, []);
  console.log(
    'PASS: real canvas pixels, no authored design DOM, typed errors, asset diagnostics, cross-page inspector, dissolve animation, Back and unchanged preview revision',
  );
} finally {
  await browser.close();
}
