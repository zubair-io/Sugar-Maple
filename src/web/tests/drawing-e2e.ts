import { chromium, expect, type Page } from '@playwright/test';
import { strict as assert } from 'node:assert';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const get = (page: Page) => page.evaluate(() => window.sugarMaple.dispatch('document.get'));
const checkpoint = (page: Page) => page.evaluate(() => window.sugarMaple.dispatch('document.checkpoint'));
const settle = (page: Page) => page.evaluate(() => window.sugarMaple.dispatch('layout.inspect'));
async function tx(page: Page, operations: any[]) {
  await page.evaluate(async operations => { const d = await window.sugarMaple.dispatch('document.get');
    await window.sugarMaple.dispatch('transaction.apply', { documentId: d.documentId, expectedRevision: d.revision,
      requestId: crypto.randomUUID(), operations }); }, operations); await settle(page);
}
async function select(page: Page, id: string) { await page.evaluate(id => window.sugarMaple.dispatch('selection.set', { id }), id); await settle(page); }
async function undo(page: Page) { const d = await get(page); await page.evaluate(args => window.sugarMaple.dispatch('history.undo', args),
  { documentId: d.documentId, expectedRevision: d.revision }); await settle(page); }
async function screen(page: Page, x: number, y: number) {
  return page.evaluate(({ x, y }) => { const rect = document.querySelector('.viewport')!.getBoundingClientRect(), camera = window.sugarMaple.viewport.camera();
    return { x: rect.x + camera.pan.x + x * camera.zoom, y: rect.y + camera.pan.y + y * camera.zoom }; }, { x, y });
}
const parent = { x: 40, y: 40, width: 500, height: 400, rotation: 25, strokeWidth: 2 };
function world(x: number, y: number) {
  const cx = parent.x + parent.width / 2, cy = parent.y + parent.height / 2, angle = parent.rotation * Math.PI / 180;
  const dx = parent.x + parent.strokeWidth + x - cx, dy = parent.y + parent.strokeWidth + y - cy;
  return { x: cx + Math.cos(angle) * dx - Math.sin(angle) * dy, y: cy + Math.sin(angle) * dx + Math.cos(angle) * dy };
}
async function point(page: Page, x: number, y: number) { const p = world(x, y); return screen(page, p.x, p.y); }
async function drag(page: Page, start: { x: number; y: number }, end: { x: number; y: number }) {
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 10 }); await page.mouse.up(); await settle(page);
}
try {
  for (const zoom of [0.5, 1.5]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 2 });
    const page = await context.newPage(), errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(process.env.SUGAR_MAPLE_TEST_URL ?? 'http://127.0.0.1:4200'); await page.waitForFunction(() => window.sugarMaple.ready);
    const d = await get(page), pageId = d.document.pages[0].id;
    await tx(page, [{ type: 'node.add', node: { id: 'frame', pageId, kind: 'frame', name: 'Drawing frame', ...parent } }]);
    await select(page, 'frame'); await page.getByRole('button', { name: 'Fit', exact: true }).click();
    await page.getByRole('slider', { name: 'Zoom' }).evaluate((slider, zoom) => { (slider as HTMLInputElement).value = String(zoom);
      slider.dispatchEvent(new Event('input', { bubbles: true })); }, zoom); await settle(page);
    await page.getByLabel('Drawing stroke color', { exact: true }).fill('#dc2626');
    await page.getByLabel('Drawing stroke width', { exact: true }).fill('8'); await page.getByLabel('Drawing stroke width', { exact: true }).press('Tab');
    for (const kind of ['line', 'arrow', 'freehand']) {
      await select(page, 'frame'); const before = await get(page);
      await page.getByRole('button', { name: 'Draw ' + kind, exact: true }).click();
      await expect(page.getByRole('button', { name: 'Draw ' + kind, exact: true })).toHaveAttribute('aria-pressed', 'true');
      const start = await point(page, 120, 130), end = await point(page, 240, 180);
      await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 10 });
      assert.deepEqual((await get(page)).document, before.document, 'Preview is not authored');
      const captureError = await page.evaluate(async () => { const d = await window.sugarMaple.dispatch('document.get');
        try { await window.sugarMaple.dispatch('render.ready', { documentId: d.documentId, expectedRevision: d.revision }); return ''; }
        catch (error) { return String(error); } });
      assert.ok(captureError.includes('Finish or cancel'), captureError);
      await page.mouse.up(); await settle(page);
      const after = await get(page), node = after.document.nodes.find((node: any) => node.id !== 'frame');
      assert.equal(after.revision, before.revision + 1); assert.equal(node.kind, 'path'); assert.equal(node.parentId, 'frame');
      assert.ok(node.pathData.length); assert.equal(node.fillEnabled, kind === 'freehand');
      const journal = await checkpoint(page); assert.equal(journal.journal.at(-1).origin, 'human');
      if (kind === 'line') {
        const values = node.pathData.match(/-?\d+(?:\.\d+)?/g).map(Number);
        assert.ok(Math.abs(node.x + values[0] - 120) < 0.1 && Math.abs(node.y + values[1] - 130) < 0.1);
        assert.ok(Math.abs(node.x + values[2] - 240) < 0.1 && Math.abs(node.y + values[3] - 180) < 0.1);
      }
      const svg = await page.evaluate(id => window.sugarMaple.dispatch('code.export', { id, target: 'svg' }), node.id);
      assert.ok(svg.code.includes('<path') && svg.code.includes(node.pathData));
      await page.screenshot({ path: `build/drawing-${kind}-chrome-${zoom}.png` });
      await undo(page); assert.deepEqual((await get(page)).document, before.document);
    }
    await select(page, 'frame'); const pathBefore = await get(page);
    await page.getByRole('button', { name: 'Draw path', exact: true }).click();
    for (const [x, y] of [[120, 130], [240, 130], [200, 200]]) { const p = await point(page, x, y); await page.mouse.click(p.x, p.y); }
    assert.deepEqual((await get(page)).document, pathBefore.document);
    await page.locator('.viewport canvas').focus(); await page.keyboard.press('Backspace'); await settle(page);
    assert.deepEqual((await get(page)).document, pathBefore.document, 'Backspace only removes an uncommitted point');
    const last = await point(page, 200, 200); await page.mouse.click(last.x, last.y);
    await page.getByRole('button', { name: 'Close path', exact: true }).click(); await settle(page);
    const pathAfter = await get(page); assert.equal(pathAfter.revision, pathBefore.revision + 1,
      JSON.stringify({ alerts: await page.getByRole('alert').allTextContents(), authoredNodes: pathAfter.document.nodes.length }));
    assert.ok(pathAfter.document.nodes.find((node: any) => node.id !== 'frame').pathData.endsWith(' Z'));
    await undo(page); assert.deepEqual((await get(page)).document, pathBefore.document);
    await select(page, 'frame'); const canceled = await checkpoint(page);
    await page.getByRole('button', { name: 'Draw arrow', exact: true }).click();
    const start = await point(page, 120, 130), end = await point(page, 240, 180);
    await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y);
    await page.locator('.viewport canvas').dispatchEvent('pointercancel', { pointerId: 1, isPrimary: true }); await page.mouse.up(); await settle(page);
    assert.deepEqual(await checkpoint(page), canceled);
    await page.getByRole('button', { name: 'Draw path', exact: true }).click(); await page.mouse.click(start.x, start.y); await page.mouse.click(end.x, end.y);
    await page.locator('.viewport canvas').focus(); await page.keyboard.press('Escape'); await settle(page);
    assert.deepEqual(await checkpoint(page), canceled);
    await expect(page.getByRole('button', { name: 'Select tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await select(page, 'frame'); await tx(page, [{ type: 'node.update', id: 'frame', patch: { locked: true } }]);
    await expect(page.getByRole('button', { name: 'Draw line', exact: true })).toBeDisabled();
    await tx(page, [{ type: 'node.update', id: 'frame', patch: { locked: false, layout: 'vertical' } }]);
    await expect(page.getByRole('button', { name: 'Draw freehand', exact: true })).toBeDisabled();
    await tx(page, [{ type: 'node.update', id: 'frame', patch: { layout: 'free' } }]);
    await page.getByRole('button', { name: 'Draw line', exact: true }).click();
    const stale = await get(page); await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y);
    await tx(page, [{ type: 'document.rename', name: 'Concurrent drawing edit' }]); await page.mouse.up(); await settle(page);
    assert.equal((await get(page)).revision, stale.revision + 1); assert.equal((await get(page)).document.nodes.length, 1);
    await page.getByRole('button', { name: 'Developer', exact: true }).click();
    await expect(page.getByRole('toolbar', { name: 'Drawing tools' })).toHaveCount(0);
    assert.deepEqual(errors, []); await context.close();
    console.log(`PASS: real line/arrow/freehand/path gestures in a rotated frame, draft/capture boundary, polyline point undo, close/cancel, locked/managed/stale guards, SVG handoff and one exact undo at DPR2 zoom ${zoom}`);
  }
} finally { await browser.close(); }
