import { editorURL } from './editor-url';
import { chromium } from '@playwright/test';
import { strict as assert } from 'node:assert';
import { mkdirSync } from 'node:fs';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(editorURL());
  await page.waitForFunction(() => window.sugarMaple?.ready);
  await page.addScriptTag({ path: 'tools/chrome-theme-page.js' });
  mkdirSync('build/chrome-theme', { recursive: true });
  let result;
  try {
    result = await page.evaluate(() => (window as any).canvasTransformAcceptance());
  } finally {
    await page.screenshot({ path: 'build/chrome-theme/light.png' });
  }
  assert.equal(result.passed, true);
  assert.deepEqual(errors, []);
  for (const theme of ['dark', 'light']) {
    await page.getByLabel('Chrome appearance', { exact: true }).selectOption(theme);
    await page.getByLabel('Grid rows', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `build/chrome-theme/${theme}.png` });
  }
  await Bun.write('build/chrome-theme/report.json', JSON.stringify(result, null, 2));
  console.log(
    'PASS: drawing and Repeat Grid theme contrast, real preview/error/drop/focus states, exact checkpoint preservation',
  );
} finally {
  await browser.close();
}
