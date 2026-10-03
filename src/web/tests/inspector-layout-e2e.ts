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
  await page.addScriptTag({ path: 'tools/inspector-layout-page.js' });
  mkdirSync('build/inspector-layout', { recursive: true });
  let result;
  try {
    result = await page.evaluate(() => (window as any).canvasTransformAcceptance());
  } finally {
    await page.screenshot({ path: 'build/inspector-layout/chrome.png' });
  }
  assert.equal(result.passed, true);
  assert.deepEqual(errors, []);
  await Bun.write('build/inspector-layout/chrome.json', JSON.stringify(result, null, 2));
  console.log(
    'PASS: readable Transform icons/fields and no overflow at 260/320/420px; exact document/history unchanged',
  );
} finally {
  await browser.close();
}
