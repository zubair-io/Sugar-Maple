import { editorURL } from './editor-url';
import { chromium, expect } from '@playwright/test';
import { strict as assert } from 'node:assert';
import { compile } from 'tailwindcss';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } }),
    errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(editorURL());
  await page.waitForFunction(() => window.sugarMaple.ready);
  await page.addScriptTag({ content: await Bun.file('tools/web-copy-page.js').text() });
  const report = await page.evaluate(() => (window as any).canvasTransformAcceptance());
  assert.equal(report.passed, true);
  assert.deepEqual(
    Object.keys(report.exported.html),
    ['code'],
    'Previously published strict response shape remains compatible',
  );
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as any).lastCopied = text;
        },
      },
    }),
  );
  await page.getByRole('button', { name: 'Copy code', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).lastCopied))
    .toBe(report.exported['tailwind-classes'].code);
  await page.getByRole('combobox', { name: 'Export target' }).selectOption('css-declarations');
  await page.getByRole('button', { name: 'Copy code', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).lastCopied))
    .toBe(report.exported['css-declarations'].code);
  await page.getByRole('button', { name: 'Copy name', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).lastCopied)).toBe('Continue action');
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw Error('Clipboard permission denied');
        },
      },
    }),
  );
  await page.getByRole('button', { name: 'Copy code', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Clipboard permission denied');
  await expect(page.locator('pre').first()).toHaveText(report.exported['css-declarations'].code);
  await page.locator('pre').first().focus();
  await expect(page.locator('pre').first()).toBeFocused();
  const beforeManual = await page.evaluate(() => window.sugarMaple.dispatch('document.checkpoint'));
  await page.locator('pre').first().press('Control+a');
  assert.equal(
    await page.evaluate(() => window.getSelection()?.toString()),
    report.exported['css-declarations'].code,
  );
  assert.equal(
    await page
      .locator('pre')
      .first()
      .evaluate((el) => {
        const event = new KeyboardEvent('keydown', {
          key: 'c',
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        });
        el.dispatchEvent(event);
        return event.defaultPrevented;
      }),
    false,
    'Selected code is not replaced by editable-element copy',
  );
  await page.locator('pre').first().press('Control+z');
  assert.deepEqual(
    await page.evaluate(() => window.sugarMaple.dispatch('document.checkpoint')),
    beforeManual,
  );

  const code = report.exported['tailwind-classes'].code;
  const css = (await compile('@tailwind utilities;')).build(code.split(' '));
  const consumer = await browser.newPage();
  const measurements = [];
  for (const width of [1440, 834, 393]) {
    await consumer.setViewportSize({ width, height: 900 });
    await consumer.setContent(report.exported['html-css'].code);
    await consumer.evaluate(() => document.fonts.ready);
    const expected = await consumer
      .getByRole('button', { name: 'Continue & <next>', exact: true })
      .boundingBox();
    const style = report.exported['css-declarations'].code;
    const fragment = `<style>${report.exported.css.code}.copy-declarations{${style}}</style><div class="node-copy-card"><button class="copy-declarations">Continue &amp; &lt;next&gt;</button></div>`;
    await consumer.setContent(fragment);
    const declarationBox = await consumer.locator('button').boundingBox();
    const classes = code.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    await consumer.setContent(
      `<style>${report.exported.css.code}${css}</style><div class="node-copy-card"><button class="${classes}">Continue &amp; &lt;next&gt;</button></div>`,
    );
    await consumer.evaluate(() => document.fonts.ready);
    const classBox = await consumer.locator('button').boundingBox();
    for (const box of [declarationBox, classBox])
      for (const key of ['x', 'y', 'width', 'height'] as const)
        assert.ok(Math.abs(box![key] - expected![key]) <= 0.1, `${width} ${key}`);
    assert.equal(
      await consumer.locator('button').evaluate((el) => getComputedStyle(el).backgroundColor),
      'rgb(36, 104, 172)',
    );
    await consumer
      .locator('button')
      .evaluate((el) => (el as HTMLElement).style.setProperty('--brand-primary', '#ff8800'));
    assert.equal(
      await consumer.locator('button').evaluate((el) => getComputedStyle(el).backgroundColor),
      'rgb(255, 136, 0)',
    );
    measurements.push({ width, expected, declarationBox, classBox });
  }
  await consumer.close();
  assert.deepEqual(errors, []);
  await Bun.write(
    'build/web-copy/chrome.json',
    JSON.stringify(
      {
        passed: true,
        checks: report.checks,
        sourceUnchanged: report.sourceUnchanged,
        viewports: measurements,
        clipboard: 'instrumented browser success/failure; exact displayed payload',
      },
      null,
      2,
    ),
  );
  await page.screenshot({ path: 'build/web-copy/chrome.png' });
  console.log(
    'PASS: distinct copied name/classes/declarations, visible exact payload/font/action prerequisites, denied clipboard manual fallback, real Tailwind 4 and complete CSS at 1440/834/393 with .1-point geometry',
  );
} finally {
  await browser.close();
}
