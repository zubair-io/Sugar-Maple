import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://127.0.0.1:4200');
await page.getByRole('button', { name: 'Create an artboard' }).click();
await page.locator('[data-node-id]').first().waitFor();
await page.getByRole('button', { name: 'Add text', exact: true }).click();
await page.getByLabel('Text', { exact: true }).fill('Hello Sugar Maple');
await page.getByLabel('Text', { exact: true }).blur();
await page.getByRole('button', { name: 'Add page', exact: true }).click();
await page.getByRole('button', { name: '▤ Page 1', exact: true }).click();
let state = await page.evaluate(() => window.sugarMaple.dispatch('document.get'));
if (state.document.pages.length !== 2 || state.document.nodes.length !== 2)
  throw Error('Create file/pages/items failed');
const text = state.document.nodes.find((n: any) => n.kind === 'text');
if (text.text !== 'Hello Sugar Maple') throw Error('Text edit failed');
const node = page.locator(`[data-node-id="${text.id}"]`);
const bounds = await node.boundingBox();
await page.mouse.move(bounds!.x + 10, bounds!.y + 10);
await page.mouse.down();
await page.mouse.move(bounds!.x + 50, bounds!.y + 30, { steps: 5 });
await page.mouse.up();
state = await page.evaluate(() => window.sugarMaple.dispatch('document.get'));
if (state.document.nodes.find((n: any) => n.id === text.id).x !== text.x + 50)
  throw Error('Drag did not update authoritative document');
await page.getByRole('button', { name: 'Developer', exact: true }).click();
await page.getByRole('combobox', { name: 'Export target' }).selectOption('html');
if (!(await page.locator('pre').innerText()).includes('Hello Sugar Maple'))
  throw Error('Code inspection mismatch: ' + (await page.locator('pre').innerText()));
await page.waitForTimeout(650);
await page.reload();
await page.waitForFunction(() => document.querySelectorAll('[data-node-id]').length === 2);
state = await page.evaluate(() => window.sugarMaple.dispatch('document.get'));
if (state.document.nodes.length !== 2) throw Error('Recovery failed');
await mkdir('build/evidence', { recursive: true });
await page.screenshot({ path: 'build/evidence/browser-editor.png' });
await browser.close();
if (errors.length) throw Error(errors.join('\n'));
console.log(
  'PASS: create artboard/text/pages, edit, pointer drag, inspect code, recover on reload; no browser errors',
);
