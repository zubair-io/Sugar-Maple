import { editorURL } from './editor-url';
import { chromium, expect } from '@playwright/test';
import { strict as assert } from 'node:assert';
import { mkdirSync } from 'node:fs';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(editorURL());
  await page.waitForFunction(() => window.sugarMaple.ready);
  const checkpoint = () => page.evaluate(() => window.sugarMaple.dispatch('document.checkpoint'));
  const baseline = await checkpoint();
  const left = page.getByRole('separator', { name: 'Resize left panel' }),
    right = page.getByRole('separator', { name: 'Resize right panel' });
  await expect(left).toHaveAttribute('aria-valuenow', '280');
  await expect(right).toHaveAttribute('aria-valuenow', '320');
  await left.press('End');
  await expect(left).toHaveAttribute('aria-valuenow', '400');
  await left.press('Home');
  await expect(left).toHaveAttribute('aria-valuenow', '220');
  await left.press('ArrowRight');
  await expect(left).toHaveAttribute('aria-valuenow', '230');
  await right.press('End');
  await expect(right).toHaveAttribute('aria-valuenow', '420');
  await right.press('Home');
  await expect(right).toHaveAttribute('aria-valuenow', '260');
  const grip = await left.boundingBox();
  assert.ok(grip);
  await page.mouse.move(grip!.x + 3, grip!.y + 120);
  await page.mouse.down();
  await page.mouse.move(grip!.x + 63, grip!.y + 120);
  await page.mouse.up();
  await expect(left).toHaveAttribute('aria-valuenow', '290');
  assert.deepEqual(await checkpoint(), baseline);
  await page.reload();
  await page.waitForFunction(() => window.sugarMaple.ready);
  await expect(left).toHaveAttribute('aria-valuenow', '290');
  await expect(right).toHaveAttribute('aria-valuenow', '260');
  assert.deepEqual((await checkpoint()).document, baseline.document);
  await page.getByLabel('Toggle left panel', { exact: true }).click();
  await expect(left).toBeHidden();
  await page.reload();
  await page.waitForFunction(() => window.sugarMaple.ready);
  await expect(left).toBeHidden();
  await page.getByLabel('Toggle left panel', { exact: true }).click();
  await expect(left).toHaveAttribute('aria-valuenow', '290');
  mkdirSync('build/workspace', { recursive: true });
  for (const width of [1440, 1024, 800]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 768 });
    for (const appearance of ['dark', 'light']) {
      await page.getByLabel('Chrome appearance', { exact: true }).selectOption(appearance);
      await page.evaluate(() => window.sugarMaple.dispatch('layout.inspect'));
      const geometry = await page.evaluate(() => {
        const bounds = (selector: string) => {
          const e = document.querySelector(selector)!;
          const b = e.getBoundingClientRect();
          return {
            x: b.x,
            right: b.right,
            width: b.width,
            height: b.height,
            client: e.clientWidth,
            scroll: e.scrollWidth,
          };
        };
        return {
          header: bounds('.topbar'),
          footer: bounds('footer'),
          canvas: bounds('.viewport'),
          toolbar: bounds('.canvas-toolbar'),
          body: bounds('.workspace'),
        };
      });
      assert.equal(geometry.header.height, 48);
      assert.equal(geometry.footer.height, 28);
      assert.ok(geometry.canvas.width >= 320, `${width}/${appearance}: ${JSON.stringify(geometry)}`);
      assert.ok(
        geometry.toolbar.scroll <= geometry.toolbar.client + 1,
        `${width} toolbar contained`,
      );
      await expect(page.getByRole('button', { name: 'MCP connection details' })).toBeVisible();
      await page.getByRole('button', { name: 'MCP connection details' }).click();
      await expect(page.getByRole('dialog')).toContainText('MCP connection');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: 'MCP connection details' })).toBeFocused();
      await page.screenshot({ path: `build/workspace/${width}-${appearance}.png` });
    }
    if (width === 800) {
      await page.getByLabel('Toggle right panel', { exact: true }).click();
      await expect(right).toBeVisible();
      await expect(left).toBeHidden();
      await page.getByLabel('Toggle left panel', { exact: true }).click();
      await expect(left).toBeVisible();
      await expect(right).toBeHidden();
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(left).toBeVisible();
  await expect(right).toBeVisible();
  const current = await checkpoint();
  assert.deepEqual(current.document, baseline.document);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: actual pointer/keyboard resizing, persisted widths/collapse/reload, constrained panel policy, 48/28 shell, overflow/appearance/MCP focus at1440/1024/800 and document invariance',
  );
} finally {
  await browser.close();
}
