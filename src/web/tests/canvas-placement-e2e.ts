import { editorURL } from './editor-url';
import { chromium, expect, type Page } from '@playwright/test';
import { strict as assert } from 'node:assert';
import { flatten, project, transform } from '../src/app/canvas/scene-layout';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const get = (page: Page) => page.evaluate(() => window.sugarMaple.dispatch('document.get'));
async function tx(page: Page, operations: any[]) {
  await page.evaluate(async (operations) => {
    const d = await window.sugarMaple.dispatch('document.get');
    await window.sugarMaple.dispatch('transaction.apply', {
      documentId: d.documentId,
      expectedRevision: d.revision,
      requestId: crypto.randomUUID(),
      operations,
    });
  }, operations);
  await page.evaluate(() => window.sugarMaple.dispatch('layout.inspect'));
}
async function undo(page: Page) {
  await page.evaluate(async () => {
    const d = await window.sugarMaple.dispatch('document.get');
    await window.sugarMaple.dispatch('history.undo', {
      documentId: d.documentId,
      expectedRevision: d.revision,
    });
  });
  await page.evaluate(() => window.sugarMaple.dispatch('layout.inspect'));
}
async function select(page: Page, ids: string[]) {
  await page.evaluate((ids) => window.sugarMaple.dispatch('selection.set', { id: ids[0] }), ids);
  for (const id of ids.slice(1))
    await page.locator(`[data-layer-id="${id}"] [role="treeitem"]`).click({ modifiers: ['Shift'] });
  await page.evaluate(() => window.sugarMaple.dispatch('layout.inspect'));
}
async function magenta(page: Page) {
  return page.locator('.viewport canvas').evaluate((el) => {
    const c = el as HTMLCanvasElement,
      d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let count = 0;
    for (let i = 0; i < d.length; i += 4)
      if (d[i] === 236 && d[i + 1] === 72 && d[i + 2] === 153) count++;
    return count;
  });
}
async function move(page: Page, dx: number, dy: number, control = false) {
  const layout = await page.evaluate(() => window.sugarMaple.dispatch('layout.inspect')),
    b = layout.nodes.find((n: any) => n.id === 'a').bounds,
    camera = await page.evaluate(() => window.sugarMaple.viewport.camera());
  const x = b.x + b.width / 2,
    y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  if (control) await page.keyboard.down('Control');
  await page.mouse.move(x + dx * camera.zoom, y + dy * camera.zoom, { steps: 4 });
  await page.evaluate(() => window.sugarMaple.dispatch('layout.inspect'));
  return async () => {
    await page.mouse.up();
    if (control) await page.keyboard.up('Control');
    await page.evaluate(() => window.sugarMaple.dispatch('layout.inspect'));
  };
}
try {
  for (const zoom of [0.5, 1.5]) {
    const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        deviceScaleFactor: 2,
      }),
      page = await context.newPage(),
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto(editorURL());
    await page.waitForFunction(() => window.sugarMaple.ready);
    const d = await get(page),
      pageId = d.document.pages[0].id;
    await tx(
      page,
      [
        ['a', 40, 40, 80, 60],
        ['b', 200, 120, 100, 80],
        ['c', 420, 300, 100, 90],
        ['locked', 360, 400, 30, 20],
        ['hidden', 360, 420, 30, 20],
      ].map(([id, x, y, width, height]) => ({
        type: 'node.add',
        node: {
          id,
          name: id,
          kind: 'rectangle',
          pageId,
          x,
          y,
          width,
          height,
          locked: id === 'locked',
          hidden: id === 'hidden',
          fill: '#2563eb',
        },
      })),
    );
    await page.getByRole('button', { name: 'Layers', exact: true }).click();
    await select(page, ['a']);
    await page.getByLabel('Zoom', { exact: true }).evaluate((el, value) => {
      (el as HTMLInputElement).value = String(value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, zoom);
    await expect(page.getByRole('button', { name: 'Snapping', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const before = await get(page);
    let finish = await move(page, 80 - 4 / zoom, 80 - 4 / zoom);
    assert.equal((await get(page)).revision, before.revision);
    assert.ok((await magenta(page)) > 0);
    await page.screenshot({ path: `build/canvas-smart-guides-${zoom}.png` });
    await finish();
    const snapped = await get(page),
      a = snapped.document.nodes.find((n: any) => n.id === 'a');
    assert.ok(Math.abs(a.x - 120) < 1e-6);
    assert.ok(Math.abs(a.y - 120) < 1e-6);
    assert.equal(snapped.revision, before.revision + 1);
    assert.equal(await magenta(page), 0);
    await undo(page);
    assert.deepEqual((await get(page)).document, before.document);
    const checkpoint = await page.evaluate(() => window.sugarMaple.dispatch('document.checkpoint'));
    await page.getByRole('button', { name: 'Snapping', exact: true }).click();
    assert.deepEqual(
      await page.evaluate(() => window.sugarMaple.dispatch('document.checkpoint')),
      checkpoint,
    );
    finish = await move(page, 80 - 4 / zoom, 80 - 4 / zoom);
    assert.equal(await magenta(page), 0);
    await finish();
    assert.ok(
      Math.abs(
        (await get(page)).document.nodes.find((n: any) => n.id === 'a').x - (120 - 4 / zoom),
      ) < 1e-6,
    );
    await undo(page);
    await page.getByRole('button', { name: 'Snapping', exact: true }).click();
    finish = await move(page, 80 - 4 / zoom, 80 - 4 / zoom, true);
    assert.equal(await magenta(page), 0);
    await finish();
    assert.ok(
      Math.abs(
        (await get(page)).document.nodes.find((n: any) => n.id === 'a').x - (120 - 4 / zoom),
      ) < 1e-6,
    );
    await undo(page);
    // Hidden/locked targets contribute no guide. Revealing the same geometry makes it eligible.
    finish = await move(page, 242, 30);
    await finish();
    assert.ok(
      Math.abs((await get(page)).document.nodes.find((n: any) => n.id === 'a').x - 282) < 1e-6,
    );
    await undo(page);
    await tx(page, [{ type: 'node.update', id: 'hidden', patch: { hidden: false } }]);
    finish = await move(page, 242, 30);
    await finish();
    assert.ok(
      Math.abs((await get(page)).document.nodes.find((n: any) => n.id === 'a').x - 280) < 1e-6,
    );
    await undo(page);
    await tx(page, [{ type: 'node.update', id: 'hidden', patch: { hidden: true } }]);
    // Snap a rotated corner, side and proportional corner through actual grips.
    await tx(page, [{ type: 'node.update', id: 'a', patch: { rotation: 25 } }]);
    for (const [kind, proportional] of [
      ['se', false],
      ['n', false],
      ['se', true],
    ] as const) {
      const d = await get(page),
        original = flatten(project(d.document, pageId)).find((i) => i.node.id === 'a')!;
      const nx = kind === 'n' ? 0 : 1,
        ny = kind === 'n' ? -1 : 1;
      const active = transform(
        original.transform,
        original.x + ((nx + 1) * original.width) / 2,
        original.y + ((ny + 1) * original.height) / 2,
      );
      const anchor = transform(
        original.transform,
        original.x + ((1 - nx) * original.width) / 2,
        original.y + ((1 - ny) * original.height) / 2,
      );
      const m = original.transform,
        dx = 23,
        dy = 10,
        lx = m[0] * dx + m[1] * dy,
        ly = m[2] * dx + m[3] * dy;
      let dw = nx * lx,
        dh = ny * ly;
      if (proportional) {
        const scale =
          Math.abs(dw / original.width) >= Math.abs(dh / original.height)
            ? 1 + dw / original.width
            : 1 + dh / original.height;
        dw = original.width * (scale - 1);
        dh = original.height * (scale - 1);
      }
      const direction =
        kind === 'n'
          ? { x: m[2], y: m[3] }
          : proportional
            ? {
                x: m[0] * original.width + m[2] * original.height,
                y: m[1] * original.width + m[3] * original.height,
              }
            : { x: 1, y: 0 };
      const length = Math.hypot(direction.x, direction.y),
        targetX = active.x + m[0] * nx * dw + m[2] * ny * dh + (direction.x / length) * 3;
      await tx(page, [
        {
          type: 'node.add',
          node: {
            id: 'resize-target',
            name: 'Resize guide target',
            pageId,
            kind: 'rectangle',
            x: targetX,
            y: 500,
            width: 20,
            height: 20,
          },
        },
      ]);
      const before = await get(page),
        grip = await page.locator(`[data-transform-handle="${kind}"]`).boundingBox();
      assert.ok(grip);
      if (proportional) await page.keyboard.down('Shift');
      await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        grip.x + grip.width / 2 + dx * zoom,
        grip.y + grip.height / 2 + dy * zoom,
        { steps: 4 },
      );
      await page.evaluate(() => window.sugarMaple.dispatch('layout.inspect'));
      assert.ok((await magenta(page)) > 0);
      await page.mouse.up();
      if (proportional) await page.keyboard.up('Shift');
      await page.evaluate(() => window.sugarMaple.dispatch('layout.inspect'));
      const after = await get(page),
        resized = flatten(project(after.document, pageId)).find((i) => i.node.id === 'a')!;
      const reached = transform(
        resized.transform,
        resized.x + ((nx + 1) * resized.width) / 2,
        resized.y + ((ny + 1) * resized.height) / 2,
      );
      const pinned = transform(
        resized.transform,
        resized.x + ((1 - nx) * resized.width) / 2,
        resized.y + ((1 - ny) * resized.height) / 2,
      );
      assert.ok(Math.abs(reached.x - targetX) < 1e-6);
      assert.ok(Math.abs(pinned.x - anchor.x) < 1e-6 && Math.abs(pinned.y - anchor.y) < 1e-6);
      assert.equal(after.revision, before.revision + 1);
      if (proportional)
        assert.ok(
          Math.abs(resized.width / resized.height - original.width / original.height) < 1e-6,
        );
      await undo(page);
      assert.deepEqual((await get(page)).document, before.document);
      await tx(page, [{ type: 'node.remove', id: 'resize-target' }]);
    }
    // All six align commands operate on visible rotated geometry in one history step.
    await tx(page, [
      { type: 'node.update', id: 'a', patch: { rotation: 20 } },
      { type: 'node.update', id: 'b', patch: { rotation: -30 } },
      { type: 'node.update', id: 'c', patch: { rotation: 10 } },
    ]);
    await select(page, ['a', 'b', 'c']);
    for (const [label, axis, size, factor] of [
      ['Align left', 'x', 'width', 0],
      ['Align horizontal center', 'x', 'width', 0.5],
      ['Align right', 'x', 'width', 1],
      ['Align top', 'y', 'height', 0],
      ['Align vertical middle', 'y', 'height', 0.5],
      ['Align bottom', 'y', 'height', 1],
    ] as const) {
      const before = await get(page);
      await page
        .getByRole('group', { name: 'Align selected layers', exact: true })
        .getByRole('button', { name: label, exact: true })
        .click();
      const after = await get(page);
      assert.equal(after.revision, before.revision + 1);
      const items = flatten(project(after.document, pageId)).filter((i) =>
          ['a', 'b', 'c'].includes(i.node.id),
        ),
        values = items.map((i) => i.bounds[axis] + i.bounds[size] * factor);
      assert.ok(values.every((v) => Math.abs(v - values[0]) < 1e-6));
      await undo(page);
      assert.deepEqual((await get(page)).document, before.document);
    }
    for (const axis of ['x', 'y'] as const) {
      const before = await get(page);
      await page
        .getByRole('button', {
          name: axis === 'x' ? 'Distribute horizontal spacing' : 'Distribute vertical spacing',
          exact: true,
        })
        .click();
      const after = await get(page);
      assert.equal(after.revision, before.revision + 1);
      const items = flatten(project(after.document, pageId))
          .filter((i) => ['a', 'b', 'c'].includes(i.node.id))
          .sort((a, b) => a.bounds[axis] - b.bounds[axis]),
        size = axis === 'x' ? 'width' : 'height';
      assert.ok(
        Math.abs(
          items[1].bounds[axis] -
            items[0].bounds[axis] -
            items[0].bounds[size] -
            (items[2].bounds[axis] - items[1].bounds[axis] - items[1].bounds[size]),
        ) < 1e-6,
      );
      const revision = after.revision;
      await page
        .getByRole('button', {
          name: axis === 'x' ? 'Distribute horizontal spacing' : 'Distribute vertical spacing',
          exact: true,
        })
        .click();
      assert.equal((await get(page)).revision, revision);
      await undo(page);
      assert.deepEqual((await get(page)).document, before.document);
    }
    await tx(page, [{ type: 'node.update', id: 'b', patch: { locked: true } }]);
    await expect(
      page
        .getByRole('group', { name: 'Align selected layers', exact: true })
        .getByRole('button', { name: 'Align left', exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'Distribute horizontal spacing', exact: true }),
    ).toBeDisabled();
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      `PASS: visible smart guides, move snapping at zoom ${zoom}, bypass/toggle/no history, hidden/locked targets, six rendered alignment commands, equal spacing, one-step undo and no-op placement`,
    );
  }
} finally {
  await browser.close();
}
