import { chromium, expect, type Page } from '@playwright/test';
import { strict as assert } from 'node:assert';
import { flatten, project, transform } from '../src/app/canvas/scene-layout';
import {
  handlePoint,
  resizeDirections,
  type ResizeHandle,
} from '../src/app/canvas/transform-geometry';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const url = process.env.SUGAR_MAPLE_TEST_URL ?? 'http://127.0.0.1:4200';
const get = (page: Page) => page.evaluate(() => window.sugarMaple.dispatch('document.get'));
async function apply(page: Page, operations: any[]) {
  return page.evaluate(async (operations) => {
    const d = await window.sugarMaple.dispatch('document.get');
    return window.sugarMaple.dispatch('transaction.apply', {
      documentId: d.documentId,
      expectedRevision: d.revision,
      requestId: crypto.randomUUID(),
      operations,
    });
  }, operations);
}
async function history(page: Page, method: 'history.undo' | 'history.redo') {
  await page.evaluate(async (method) => {
    const d = await window.sugarMaple.dispatch('document.get');
    return window.sugarMaple.dispatch(method, {
      documentId: d.documentId,
      expectedRevision: d.revision,
    });
  }, method);
}
async function item(page: Page) {
  const d = await get(page);
  return flatten(project(d.document, d.document.pages[0].id)).find((i) => i.node.id === 'child')!;
}
const close = (actual: number, expected: number, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
async function center(page: Page, kind: string) {
  await page.evaluate(() => window.sugarMaple.dispatch('layout.inspect'));
  const box = await page.locator(`[data-transform-handle="${kind}"]`).boundingBox();
  assert.ok(box);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
try {
  for (const dpr of [1, 2])
    for (const zoom of [0.5, 1.5]) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        deviceScaleFactor: dpr,
      });
      const page = await context.newPage(),
        errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(url);
      await page.waitForFunction(() => window.sugarMaple.ready);
      const d = await get(page),
        pageId = d.document.pages[0].id;
      await apply(page, [
        {
          type: 'node.add',
          node: {
            id: 'parent',
            name: 'Rotated parent',
            kind: 'frame',
            pageId,
            x: 40,
            y: 40,
            width: 500,
            height: 450,
            rotation: 35,
            strokeWidth: 2,
          },
        },
        {
          type: 'node.add',
          node: {
            id: 'child',
            name: 'Rotated child',
            kind: 'rectangle',
            pageId,
            parentId: 'parent',
            x: 140,
            y: 160,
            width: 160,
            height: 90,
            rotation: 30,
            fill: '#2563eb',
          },
        },
      ]);
      await page.evaluate(() => window.sugarMaple.dispatch('selection.set', { id: 'child' }));
      await page.getByLabel('Zoom', { exact: true }).evaluate((el, value) => {
        (el as HTMLInputElement).value = String(value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }, zoom);
      await expect(page.locator('[data-transform-handle]')).toHaveCount(9);
      assert.equal((await page.evaluate(() => window.sugarMaple.viewport.camera())).zoom, zoom);
      for (const kind of Object.keys(resizeDirections) as ResizeHandle[]) {
        const before = await get(page),
          original = await item(page),
          [nx, ny] = resizeDirections[kind];
        const pinned = transform(
          original.transform,
          original.x + ((1 - nx) * original.width) / 2,
          original.y + ((1 - ny) * original.height) / 2,
        );
        const grip = await center(page, kind);
        const camera = await page.evaluate(() => window.sugarMaple.viewport.camera());
        const viewport = await page.locator('.viewport').boundingBox();
        assert.ok(viewport);
        const projected = handlePoint(original, kind, zoom);
        // CSS layout quantizes absolute positioning to 1/64 px; scene anchors
        // below retain the stricter world-coordinate tolerance.
        close(grip.x, viewport.x + camera.pan.x + projected.x * zoom, 1 / 64);
        close(grip.y, viewport.y + camera.pan.y + projected.y * zoom, 1 / 64);
        await page.mouse.move(grip.x, grip.y);
        await page.mouse.down();
        assert.equal(
          await page
            .locator('.viewport canvas')
            .evaluate((el) => (el as HTMLCanvasElement).hasPointerCapture(1)),
          true,
        );
        await page.mouse.move(grip.x + 19, grip.y + 13, { steps: 4 });
        assert.equal((await get(page)).revision, before.revision);
        await page.mouse.up();
        const after = await get(page),
          resized = await item(page);
        assert.equal(after.revision, before.revision + 1);
        const anchor = transform(
          resized.transform,
          resized.x + ((1 - nx) * resized.width) / 2,
          resized.y + ((1 - ny) * resized.height) / 2,
        );
        close(anchor.x, pinned.x);
        close(anchor.y, pinned.y);
        await history(page, 'history.undo');
        assert.deepEqual((await get(page)).document, before.document);
        await history(page, 'history.redo');
        assert.deepEqual((await get(page)).document, after.document);
        await history(page, 'history.undo');
      }
      // Shift is aspect lock on a grip, rather than selection toggling.
      const grip = await center(page, 'se'),
        beforeAspect = await get(page);
      await page.keyboard.down('Shift');
      await page.mouse.move(grip.x, grip.y);
      await page.mouse.down();
      await page.mouse.move(grip.x + 23, grip.y + 11, { steps: 4 });
      await page.mouse.up();
      await page.keyboard.up('Shift');
      const aspect = await item(page);
      close(aspect.width / aspect.height, 160 / 90);
      assert.deepEqual(
        (await page.evaluate(() => window.sugarMaple.dispatch('editor.discover'))).selectionIds,
        ['child'],
      );
      assert.equal((await get(page)).revision, beforeAspect.revision + 1);
      await history(page, 'history.undo');
      // Each accessible grip accepts keyboard editing and preserves its opposite anchor.
      for (const kind of Object.keys(resizeDirections) as ResizeHandle[]) {
        const before = await get(page),
          original = await item(page),
          [nx, ny] = resizeDirections[kind];
        const pinned = transform(
          original.transform,
          original.x + ((1 - nx) * original.width) / 2,
          original.y + ((1 - ny) * original.height) / 2,
        );
        await page.locator(`[data-transform-handle="${kind}"]`).focus();
        await page.keyboard.press('ArrowRight');
        const after = await get(page),
          resized = await item(page);
        assert.equal(after.revision, before.revision + 1);
        const anchor = transform(
          resized.transform,
          resized.x + ((1 - nx) * resized.width) / 2,
          resized.y + ((1 - ny) * resized.height) / 2,
        );
        close(anchor.x, pinned.x);
        close(anchor.y, pinned.y);
        await history(page, 'history.undo');
      }
      const beforeRotation = await get(page),
        original = await item(page);
      const worldCenter = transform(
        original.transform,
        original.x + original.width / 2,
        original.y + original.height / 2,
      );
      const rotate = await center(page, 'rotate'),
        camera = await page.evaluate(() => window.sugarMaple.viewport.camera());
      const viewport = await page.locator('.viewport').boundingBox();
      assert.ok(viewport);
      const screenCenter = {
        x: viewport.x + camera.pan.x + worldCenter.x * zoom,
        y: viewport.y + camera.pan.y + worldCenter.y * zoom,
      };
      const startAngle = Math.atan2(rotate.y - screenCenter.y, rotate.x - screenCenter.x),
        radius = Math.hypot(rotate.x - screenCenter.x, rotate.y - screenCenter.y);
      await page.mouse.move(rotate.x, rotate.y);
      await page.mouse.down();
      for (let i = 1; i <= 12; i++)
        await page.mouse.move(
          screenCenter.x + radius * Math.cos(startAngle + (i * Math.PI) / 36),
          screenCenter.y + radius * Math.sin(startAngle + (i * Math.PI) / 36),
        );
      await page.mouse.up();
      const rotated = await item(page),
        afterRotation = await get(page);
      assert.equal(afterRotation.revision, beforeRotation.revision + 1);
      assert.ok(Math.abs(rotated.node.rotation - 90) < 1, String(rotated.node.rotation));
      const rotatedCenter = transform(
        rotated.transform,
        rotated.x + rotated.width / 2,
        rotated.y + rotated.height / 2,
      );
      close(rotatedCenter.x, worldCenter.x);
      close(rotatedCenter.y, worldCenter.y);
      await history(page, 'history.undo');
      assert.deepEqual((await get(page)).document, beforeRotation.document);
      await page
        .getByRole('button', { name: 'Rotate selected element', exact: true })
        .press('Shift+ArrowRight');
      assert.equal((await item(page)).node.rotation, 40);
      await history(page, 'history.undo');
      // Nudge follows world axes even under a rotated parent.
      await page.locator('.viewport canvas').focus();
      await page.keyboard.press('ArrowRight');
      const nudged = await item(page),
        nudgeCenter = transform(
          nudged.transform,
          nudged.x + nudged.width / 2,
          nudged.y + nudged.height / 2,
        );
      close(nudgeCenter.x, worldCenter.x + 1);
      close(nudgeCenter.y, worldCenter.y);
      await history(page, 'history.undo');
      for (const cancellation of ['pointercancel', 'blur']) {
        const before = await get(page),
          p = await center(page, 'nw');
        await page.mouse.move(p.x, p.y);
        await page.mouse.down();
        await page.mouse.move(p.x - 30, p.y - 20);
        if (cancellation === 'pointercancel')
          await page
            .locator('.viewport canvas')
            .dispatchEvent('pointercancel', { pointerId: 1, isPrimary: true });
        else await page.evaluate(() => window.dispatchEvent(new Event('blur')));
        await page.mouse.up();
        assert.equal((await get(page)).revision, before.revision);
        assert.deepEqual((await get(page)).document, before.document);
      }
      const pending = await center(page, 'se');
      await page.mouse.move(pending.x, pending.y);
      await page.mouse.down();
      await page.mouse.move(pending.x + 30, pending.y + 20);
      await apply(page, [
        { type: 'node.update', id: 'child', patch: { name: 'Agent edit during resize' } },
      ]);
      const agent = await get(page);
      await page.mouse.up();
      assert.equal((await get(page)).revision, agent.revision);
      assert.deepEqual((await get(page)).document, agent.document);
      const beforeMode = await get(page),
        modeGrip = await center(page, 'se');
      await page.mouse.move(modeGrip.x, modeGrip.y);
      await page.mouse.down();
      await page.mouse.move(modeGrip.x + 30, modeGrip.y + 20);
      await page
        .getByRole('button', { name: 'Prototype', exact: true })
        .evaluate((el) => (el as HTMLButtonElement).click());
      await expect(page.locator('[data-transform-handle]')).toHaveCount(0);
      assert.equal(
        await page
          .locator('.viewport canvas')
          .evaluate((el) => (el as HTMLCanvasElement).hasPointerCapture(1)),
        false,
      );
      await page.mouse.up();
      assert.equal((await get(page)).revision, beforeMode.revision);
      assert.deepEqual((await get(page)).document, beforeMode.document);
      await page.getByRole('button', { name: 'Design', exact: true }).click();
      const beforePan = await get(page),
        panGrip = await center(page, 'se');
      await page.keyboard.down('Alt');
      await page.mouse.move(panGrip.x, panGrip.y);
      await page.mouse.down();
      await page.mouse.move(panGrip.x + 20, panGrip.y + 10);
      await page.mouse.up();
      await page.keyboard.up('Alt');
      assert.equal((await get(page)).revision, beforePan.revision);
      // A pan initiated over a handle must not arm a later resize.
      const layout = await page.evaluate(() => window.sugarMaple.dispatch('layout.inspect'));
      const childBox = layout.nodes.find((n: any) => n.id === 'child').bounds;
      await page.mouse.move(childBox.x + childBox.width / 2, childBox.y + childBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        childBox.x + childBox.width / 2 + 10,
        childBox.y + childBox.height / 2 + 10,
      );
      await page.mouse.up();
      close((await item(page)).width, 160);
      close((await item(page)).height, 90);
      assert.equal((await get(page)).revision, beforePan.revision + 1);
      await history(page, 'history.undo');
      await apply(page, [{ type: 'node.update', id: 'parent', patch: { locked: true } }]);
      await expect(page.locator('[data-transform-handle]')).toHaveCount(0);
      const locked = await get(page);
      await page.locator('.viewport canvas').focus();
      await page.keyboard.press('ArrowRight');
      assert.equal((await get(page)).revision, locked.revision);
      await apply(page, [
        { type: 'node.update', id: 'parent', patch: { locked: false, hidden: true } },
      ]);
      await expect(page.locator('[data-transform-handle]')).toHaveCount(0);
      await apply(page, [{ type: 'node.update', id: 'parent', patch: { hidden: false } }]);
      await expect(page.locator('[data-transform-handle]')).toHaveCount(9);
      await page.getByRole('button', { name: 'Prototype', exact: true }).click();
      await expect(page.locator('[data-transform-handle]')).toHaveCount(0);
      await page.getByRole('button', { name: 'Design', exact: true }).click();
      await expect(page.locator('[data-transform-handle]')).toHaveCount(9);
      if (dpr === 2 && zoom === 1.5) {
        await page.screenshot({ path: 'build/canvas-transform-handles.png' });
      }
      assert.deepEqual(errors, []);
      await context.close();
      console.log(
        `Canvas transforms PASS: DPR ${dpr}, zoom ${zoom}; 8 pointer/keyboard grips, rotation, history, capture, cancellation, locks and modes`,
      );
    }
} finally {
  await browser.close();
}
