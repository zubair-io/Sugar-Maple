import { editorURL } from './editor-url';
import { chromium } from '@playwright/test';
import { strict as assert } from 'node:assert';
import { mkdirSync } from 'node:fs';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
    errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(editorURL());
  await page.waitForFunction(() => window.sugarMaple.ready);
  await page.addScriptTag({ path: 'tools/sidebar-inspector-page.js' });
  mkdirSync('build/sidebar-inspector', { recursive: true });
  await page.exposeFunction('sidebarCapture', async (name: string) => {
    await page.screenshot({ path: `build/sidebar-inspector/${name}.png` });
  });
  let result;
  try {
    result = await page.evaluate(() => (window as any).canvasTransformAcceptance());
  } finally {
    await page.screenshot({ path: 'build/sidebar-inspector/chrome.png' });
  }
  assert.equal(result.checks, 8);
  assert.equal(result.passed, true);
  assert.deepEqual(errors, []);
  await Bun.write('build/sidebar-inspector/chrome.json', JSON.stringify(result, null, 2));
  console.log(
    'PASS: keyboard page rename, safe layer expansion/icons, contextual atomic prototype destinations, explicit output labels and locked/comments matrix',
  );
} finally {
  await browser.close();
}
