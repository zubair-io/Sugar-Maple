import { editorURL } from './editor-url';
import { chromium } from '@playwright/test';
import { strict as assert } from 'node:assert';
import { mkdirSync } from 'node:fs';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(editorURL());
  await page.waitForFunction(() => window.sugarMaple?.ready);
  await page.addScriptTag({ path: 'tools/selection-inspector-page.js' });
  mkdirSync('build/selection-inspector', { recursive: true });
  let result;
  try {
    result = await page.evaluate(() => (window as any).canvasTransformAcceptance());
  } finally {
    await page.screenshot({ path: 'build/selection-inspector/chrome.png' });
  }
  assert.equal(result.passed, true);
  assert.deepEqual(errors, []);
  await page.getByLabel('Chrome appearance', { exact: true }).selectOption('light');
  await page.evaluate(() => window.sugarMaple.dispatch('layout.inspect'));
  await page.screenshot({ path: 'build/selection-inspector/chrome-light.png' });
  await Bun.write('build/selection-inspector/chrome.json', JSON.stringify(result, null, 2));
  console.log('PASS: truthful multi-selection, atomic batch/undo and mode insertion guards');
} finally {
  await browser.close();
}
