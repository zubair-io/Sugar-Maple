import { editorURL } from './editor-url';
import { chromium, expect } from '@playwright/test';
import { strict as assert } from 'node:assert';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { importedRepeatFixture } from '../../../tools/repeat-fixture';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
const { store, grid } = importedRepeatFixture(),
  errors: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));
const folder = resolve('build/repeat-handles');
mkdirSync(folder, { recursive: true });
const checkpoint = () => page.evaluate(() => window.sugarMaple.dispatch('document.checkpoint'));
const settle = () => page.evaluate(() => window.sugarMaple.dispatch('layout.inspect'));
async function undo() {
  await page.evaluate(async () => {
    const d = await window.sugarMaple.dispatch('document.get');
    await window.sugarMaple.dispatch('history.undo', {
      documentId: d.documentId,
      expectedRevision: d.revision,
    });
  });
  await settle();
}
async function transact(operations: any[]) {
  await page.evaluate(async (operations) => {
    const d = await window.sugarMaple.dispatch('document.get');
    await window.sugarMaple.dispatch('transaction.apply', {
      documentId: d.documentId,
      expectedRevision: d.revision,
      requestId: crypto.randomUUID(),
      operations,
    });
  }, operations);
  await settle();
}
async function down(kind: 'columns' | 'rows' | 'gap', delta: number, zoom: number) {
  const control = page.getByRole('slider', { name: `Repeat Grid ${kind}`, exact: true });
  await expect(control).toBeVisible();
  const box = (await control.boundingBox())!,
    x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(
    x + (kind === 'rows' ? 0 : delta * zoom),
    y + (kind === 'rows' ? delta * zoom : 0),
    { steps: 8 },
  );
  await settle();
}
const cells = (document: any) =>
  document.nodes.filter((n: any) => n.parentId === grid && n.repeatIndex !== null);
try {
  await page.goto(editorURL());
  await page.waitForFunction(() => window.sugarMaple.ready);
  await page.evaluate(
    async ({ nodes, assets, grid }) => {
      const d = await window.sugarMaple.dispatch('document.get');
      await window.sugarMaple.dispatch('transaction.apply', {
        documentId: d.documentId,
        expectedRevision: d.revision,
        requestId: crypto.randomUUID(),
        operations: [
          ...Object.entries(assets).map(([key, source]) => ({ type: 'asset.set', key, source })),
          ...nodes.map((n) => ({
            type: 'node.add',
            node: { ...n, pageId: d.document.pages[0].id },
          })),
        ],
      });
      await window.sugarMaple.dispatch('selection.set', { id: grid });
      await window.sugarMaple.dispatch('viewport.fit');
    },
    { nodes: store.document.nodes, assets: store.document.assets, grid },
  );
  let checks = 0;
  for (const zoom of [0.5, 1.5]) {
    await page.getByLabel('Zoom', { exact: true }).fill(String(zoom));
    await settle();
    for (const [kind, delta, expected] of [
      ['columns', 216, 3],
      ['rows', 236, 2],
      ['gap', 12, 40],
    ] as const) {
      const before = await checkpoint();
      await down(kind, delta, zoom);
      assert.deepEqual(
        await checkpoint(),
        before,
        'The drag preview never enters authored history',
      );
      await expect(
        page.getByRole('slider', { name: `Repeat Grid ${kind}`, exact: true }),
      ).toHaveAttribute('aria-valuenow', String(expected));
      const refused = await page.evaluate(async () => {
        try {
          const d = await window.sugarMaple.dispatch('document.get');
          await window.sugarMaple.dispatch('render.ready', {
            documentId: d.documentId,
            expectedRevision: d.revision,
          });
          return false;
        } catch (error) {
          return String(error).includes('Finish or cancel');
        }
      });
      assert.equal(refused, true);
      await page.mouse.up();
      await settle();
      const after = await checkpoint();
      assert.equal(after.journal.length, before.journal.length + 1);
      assert.equal(cells(after.document).length, kind === 'columns' ? 3 : kind === 'rows' ? 4 : 2);
      assert.deepEqual(
        cells(after.document)
          .slice(0, 2)
          .map((n: any) => n.id),
        cells(before.document).map((n: any) => n.id),
      );
      assert.equal(after.document.nodes.find((n: any) => n.id === 'title')!.text, 'First');
      assert.equal(
        after.document.nodes.find((n: any) => n.id === 'photo')!.asset,
        store.document.nodes.find((n) => n.id === 'photo')!.asset,
      );
      assert.equal(
        after.document.nodes.some((n: any) => n.id.startsWith('repeat-draft-')),
        false,
      );
      await undo();
      assert.deepEqual((await checkpoint()).document, before.document);
      checks++;
    }
    const canceled = await checkpoint();
    await down('columns', 216, zoom);
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await settle();
    assert.deepEqual(await checkpoint(), canceled);
    await expect(
      page.getByRole('slider', { name: 'Repeat Grid columns', exact: true }),
    ).toBeVisible();
    checks++;
    await down('columns', 216, zoom);
    await page
      .locator('.viewport canvas')
      .dispatchEvent('pointercancel', { pointerId: 1, isPrimary: true, pointerType: 'mouse' });
    await page.mouse.up();
    await settle();
    assert.deepEqual(await checkpoint(), canceled);
    checks++;
    await down('columns', 216, zoom);
    await transact([{ type: 'document.rename', name: `Concurrent repeat ${zoom}` }]);
    await page.mouse.up();
    await settle();
    assert.equal(cells((await checkpoint()).document).length, 2);
    await undo();
    checks++;
    await down('columns', 216, zoom);
    await transact([{ type: 'node.remove', id: grid }]);
    await page.mouse.up();
    await settle();
    assert.equal(cells((await checkpoint()).document).length, 0);
    await expect(page.locator('[data-repeat-handle]')).toHaveCount(0);
    await undo();
    await page.evaluate((grid) => window.sugarMaple.dispatch('selection.set', { id: grid }), grid);
    await settle();
    checks++;
  }
  const baseline = await checkpoint();
  const columns = page.getByRole('slider', { name: 'Repeat Grid columns', exact: true });
  await columns.click();
  await page.keyboard.press('ArrowRight');
  await settle();
  assert.equal(cells((await checkpoint()).document).length, 3);
  await undo();
  assert.deepEqual((await checkpoint()).document, baseline.document);
  checks++;
  await columns.focus();
  await columns.press('Home');
  await settle();
  assert.equal(cells((await checkpoint()).document).length, 1);
  await undo();
  assert.deepEqual((await checkpoint()).document, baseline.document);
  checks++;
  const gap = page.getByRole('slider', { name: 'Repeat Grid gap', exact: true });
  await gap.focus();
  await gap.press('Shift+ArrowRight');
  await settle();
  assert.equal((await checkpoint()).document.nodes.find((n: any) => n.id === grid)!.gap, 26);
  await undo();
  checks++;
  await transact([{ type: 'node.update', id: 'board', patch: { locked: true } }]);
  await expect(page.locator('[data-repeat-handle]')).toHaveCount(0);
  await undo();
  checks++;
  await page.getByRole('button', { name: 'Developer', exact: true }).click();
  await expect(page.locator('[data-repeat-handle]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await expect(columns).toBeVisible();
  checks++;
  await transact([{ type: 'repeat.resize', id: grid, rows: 2, columns: 3, count: 5 }]);
  const partial = await checkpoint();
  await gap.focus();
  await gap.press('ArrowRight');
  await settle();
  assert.deepEqual(
    cells((await checkpoint()).document).map((n: any) => n.id),
    cells(partial.document).map((n: any) => n.id),
  );
  await undo();
  assert.deepEqual((await checkpoint()).document, partial.document);
  await undo();
  checks++;
  await page.evaluate(() => window.sugarMaple.dispatch('viewport.fit'));
  await settle();
  await page.screenshot({ path: resolve(folder, 'browser.png') });
  assert.deepEqual(errors, []);
  await Bun.write(
    resolve(folder, 'browser-report.json'),
    JSON.stringify(
      {
        passed: true,
        checks,
        zoom: [0.5, 1.5],
        scope:
          'Actual production Canvas controls: pointer capture, row/column/gutter previews and one-step commit/undo, data retention, capture guard, Escape/pointercancel/stale cancellation, keyboard sliders and inherited-lock/read-only guards',
        accessibility: await page.locator('repeat-handles').ariaSnapshot(),
      },
      null,
      2,
    ),
  );
  console.log(`PASS: ${checks} real Repeat Grid Canvas pointer/keyboard/cancel/history cases`);
} finally {
  await browser.close();
}
