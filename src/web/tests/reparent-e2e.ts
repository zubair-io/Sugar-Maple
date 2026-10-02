import { chromium, expect, type Page } from '@playwright/test';
import { strict as assert } from 'node:assert';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const get = (page: Page) => page.evaluate(() => window.sugarMaple.dispatch('document.get'));
const checkpoint = (page: Page) => page.evaluate(() => window.sugarMaple.dispatch('document.checkpoint'));
async function tx(page: Page, operations: any[]) {
  await page.evaluate(async operations => {
    const d = await window.sugarMaple.dispatch('document.get');
    await window.sugarMaple.dispatch('transaction.apply', { documentId: d.documentId, expectedRevision: d.revision,
      requestId: crypto.randomUUID(), operations });
  }, operations);
  await page.evaluate(() => window.sugarMaple.dispatch('layout.inspect'));
}
async function undo(page: Page) {
  await page.evaluate(async () => {
    const d = await window.sugarMaple.dispatch('document.get');
    await window.sugarMaple.dispatch('history.undo', { documentId: d.documentId, expectedRevision: d.revision });
  });
  await page.evaluate(() => window.sugarMaple.dispatch('layout.inspect'));
}
async function select(page: Page, ids: string[]) {
  await page.evaluate(id => window.sugarMaple.dispatch('selection.set', { id }), ids[0]);
  for (const id of ids.slice(1)) await page.locator(`[data-layer-id="${id}"] [role="treeitem"]`).click({ modifiers: ['Shift'] });
}
const rendered = (page: Page) => page.evaluate(() => window.sugarMaple.dispatch('layout.inspect'));
function sameBounds(a: any, b: any, ids: string[]) {
  for (const id of ids) {
    const aa = a.nodes.find((n: any) => n.id === id).bounds, bb = b.nodes.find((n: any) => n.id === id).bounds;
    for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(aa[key] - bb[key]) < 1e-5, `${id} ${key}`);
  }
}
async function move(page: Page, ids: string[], parentId: string | null, placement = 'preserve-world') {
  return page.evaluate(async ({ ids, parentId, placement }) => {
    const d = await window.sugarMaple.dispatch('document.get');
    return window.sugarMaple.dispatch('nodes.reparent', { documentId: d.documentId, expectedRevision: d.revision, ids, parentId, placement });
  }, { ids, parentId, placement });
}
async function rejected(page: Page, ids: string[], parentId: string | null, pattern: RegExp) {
  const before = await checkpoint(page);
  const message = await page.evaluate(async ({ ids, parentId }) => {
    const d = await window.sugarMaple.dispatch('document.get');
    try { await window.sugarMaple.dispatch('nodes.reparent', { documentId: d.documentId, expectedRevision: d.revision, ids, parentId }); }
    catch (error) { return String(error); }
    return '';
  }, { ids, parentId });
  assert.match(message, pattern); assert.deepEqual(await checkpoint(page), before);
}
try {
  for (const zoom of [0.5, 1.5]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
    const page = await context.newPage(), errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(process.env.SUGAR_MAPLE_TEST_URL ?? 'http://127.0.0.1:4200');
    await page.waitForFunction(() => window.sugarMaple.ready);
    const initial = await get(page), pageId = initial.document.pages[0].id;
    await tx(page, [
      { id: 'outer', name: 'Outer', kind: 'frame', x: 20, y: 50, width: 500, height: 400, rotation: 40, strokeWidth: 5 },
      { id: 'old', name: 'Old', kind: 'frame', parentId: 'outer', x: 20, y: 30, width: 300, height: 270, rotation: -65, strokeWidth: 7 },
      { id: 'new', name: 'New', kind: 'frame', x: 550, y: 70, width: 500, height: 450, rotation: -35, strokeWidth: 11 },
      { id: 'a', name: 'A', kind: 'frame', parentId: 'old', x: 60, y: 80, width: 120, height: 75, rotation: 30, fill: '#2563eb' },
      { id: 'child', name: 'Child', kind: 'rectangle', parentId: 'a', x: 4, y: 7, widthMode: 'percent', widthPercent: 80, height: 25, rotation: 10 },
      { id: 'b', name: 'B', kind: 'text', parentId: 'old', x: 120, y: 200, width: 200, height: 40, widthMode: 'hug', heightMode: 'hug', text: '世界 café', rotation: -20 },
      { id: 'existing', name: 'Existing', kind: 'rectangle', parentId: 'new', x: 20, y: 30, width: 30, height: 40, order: 900 },
    ].map(node => ({ type: 'node.add', node: { pageId, ...node } })));
    await page.getByRole('button', { name: 'Layers', exact: true }).click();
    await page.getByLabel('Zoom', { exact: true }).evaluate((el, value) => {
      (el as HTMLInputElement).value = String(value); el.dispatchEvent(new Event('change', { bubbles: true }));
    }, zoom);
    await select(page, ['a', 'b']);
    const baseline = await get(page), bounds = await rendered(page), saved = await checkpoint(page);
    await page.getByRole('combobox', { name: 'Parent', exact: true }).selectOption('new');
    const preview = page.getByRole('region', { name: 'Move layer preview' });
    await expect(preview).toBeVisible();
    await expect(preview).toContainText('responsive sizing becomes fixed');
    await expect(preview).toContainText('new parent clips');
    assert.deepEqual(await checkpoint(page), saved);
    await preview.getByRole('button', { name: 'Cancel layer move' }).click();
    await expect(preview).toHaveCount(0); assert.deepEqual(await checkpoint(page), saved);
    await page.getByRole('combobox', { name: 'Parent', exact: true }).selectOption('new');
    await expect(preview).toBeVisible();
    await page.screenshot({ path: `build/reparent-preview-chrome-${zoom}.png` });
    await preview.getByRole('button', { name: 'Apply layer move' }).click();
    const changed = await get(page);
    assert.equal(changed.revision, baseline.revision + 1);
    assert.equal(changed.document.nodes.find((n: any) => n.id === 'a').parentId, 'new');
    assert.equal(changed.document.nodes.find((n: any) => n.id === 'b').widthMode, 'fixed');
    sameBounds(bounds, await rendered(page), ['a', 'b', 'child']);
    await page.screenshot({ path: `build/reparent-chrome-${zoom}.png` });
    await undo(page); assert.deepEqual((await get(page)).document, baseline.document);
    await move(page, ['a', 'child'], null);
    sameBounds(bounds, await rendered(page), ['a', 'child']);
    await undo(page); assert.deepEqual((await get(page)).document, baseline.document);
    const noOp = await checkpoint(page); await move(page, ['a', 'b'], 'old');
    assert.deepEqual(await checkpoint(page), noOp);
    await rejected(page, ['old'], 'a', /Parent cycle/);
    await rejected(page, ['a', 'a'], 'new', /distinct/);
    for (const key of ['locked', 'hidden']) {
      await tx(page, [{ type: 'node.update', id: 'outer', patch: { [key]: true } }]);
      await expect(page.getByRole('combobox', { name: 'Parent', exact: true })).toBeDisabled();
      await expect(page.getByRole('combobox', { name: 'Parent', exact: true })).toHaveValue('old');
      await rejected(page, ['a'], 'new', /Unlock and show/); await undo(page);
    }
    await tx(page, [{ type: 'node.update', id: 'new', patch: { layout: 'vertical' } }]);
    await rejected(page, ['a', 'b'], 'new', /controls child positions/);
    await select(page, ['a', 'b']);
    await page.getByRole('combobox', { name: 'Reparent placement' }).selectOption('layout');
    await page.getByRole('combobox', { name: 'Parent', exact: true }).selectOption('new');
    await expect(preview).toBeVisible(); await expect(preview).toContainText('determine the new placement');
    await preview.getByRole('button', { name: 'Apply layer move' }).click();
    assert.equal((await get(page)).document.nodes.find((n: any) => n.id === 'b').widthMode, 'hug');
    await undo(page); await undo(page); assert.deepEqual((await get(page)).document, baseline.document);
    await select(page, ['a', 'b']);
    await page.getByRole('combobox', { name: 'Reparent placement' }).selectOption('preserve-world');
    await page.getByRole('combobox', { name: 'Parent', exact: true }).selectOption('new');
    await expect(preview).toBeVisible();
    await tx(page, [{ type: 'node.update', id: 'a', patch: { fill: '#ff0000' } }]);
    await expect(preview).toHaveCount(0);
    await undo(page); assert.deepEqual((await get(page)).document, baseline.document);
    // A concurrent edit during the actual asynchronous settle must invalidate the high-level command.
    const stale = await page.evaluate(async () => {
      const d = await window.sugarMaple.dispatch('document.get');
      const pending = window.sugarMaple.dispatch('nodes.reparent', { documentId: d.documentId, expectedRevision: d.revision,
        ids: ['a'], parentId: 'new', placement: 'preserve-world' }).then(() => '', (error: unknown) => String(error));
      await window.sugarMaple.dispatch('transaction.apply', { documentId: d.documentId, expectedRevision: d.revision,
        requestId: crypto.randomUUID(), operations: [{ type: 'node.update', id: 'a', patch: { fill: '#ff0000' } }] });
      return pending;
    });
    assert.match(stale, /Stale revision/); assert.equal((await get(page)).document.nodes.find((n: any) => n.id === 'a').parentId, 'old');
    await undo(page); assert.deepEqual((await get(page)).document, baseline.document);
    await tx(page, [
      { type: 'page.add', id: 'foreign-page', name: 'Other page' },
      { type: 'node.add', node: { id: 'foreign-source', name: 'Other source', pageId: 'foreign-page', kind: 'frame', x: 30, y: 50, width: 500, height: 400, rotation: 40, strokeWidth: 3 } },
      { type: 'node.add', node: { id: 'foreign-target', name: 'Other target', pageId: 'foreign-page', kind: 'frame', x: 200, y: 100, width: 500, height: 400, rotation: -30, strokeWidth: 7 } },
      { type: 'node.add', node: { id: 'foreign-text', name: 'Other text', pageId: 'foreign-page', parentId: 'foreign-source', kind: 'text', x: 40, y: 60,
        widthMode: 'hug', heightMode: 'hug', text: 'Bundled font 世界 café', fontFamily: 'Maple Sans', rotation: 10 } },
    ]);
    await select(page, ['foreign-text']);
    const foreignBefore = await rendered(page);
    await select(page, ['a']);
    await move(page, ['foreign-text'], 'foreign-target');
    assert.equal((await rendered(page)).pageId, pageId, 'Agent reparent does not switch the human page');
    await select(page, ['foreign-text']);
    sameBounds(foreignBefore, await rendered(page), ['foreign-text']);
    await undo(page); await undo(page);
    assert.deepEqual((await get(page)).document, baseline.document);
    const capabilities = await page.evaluate(() => window.sugarMaple.dispatch('capabilities'));
    assert.ok(capabilities.toolSchemas['nodes.reparent']); assert.ok(capabilities.toolOutputSchemas['nodes.reparent']);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS: reparent preview/cancel, rotated world placement and descendants, hug conversion, local-flow mode, one undo, no-op, cycle/lock/hidden rejection and stale async guard at zoom ${zoom}`);
  }
} finally { await browser.close(); }
