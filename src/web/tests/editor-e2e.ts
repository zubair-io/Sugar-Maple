import { chromium, expect } from '@playwright/test';
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
await page.keyboard.press('Meta+z');
const undone = await page.evaluate(() => window.sugarMaple.dispatch('document.get'));
if (undone.document.nodes.find((n: any) => n.id === text.id).x !== text.x)
  throw Error('Recovered undo history failed');
await page.keyboard.press('Meta+Shift+z');
const redone = await page.evaluate(() => window.sugarMaple.dispatch('document.get'));
if (redone.document.nodes.find((n: any) => n.id === text.id).x !== text.x + 50)
  throw Error('Recovered redo history failed');

await mkdir('build/evidence', { recursive: true });

await page.getByRole('button', { name: 'Design', exact: true }).click();
await expect(page.locator('.inspector-heading')).toContainText('Details');
await page.getByRole('button', { name: 'Layers', exact: true }).click();
await page.getByLabel('Find layer', { exact: true }).fill('Hello');
const beforePanels = await page.evaluate(() => window.sugarMaple.dispatch('document.get'));
const initialCanvas = await page.locator('.canvas-shell').boundingBox();
await page.getByRole('button', { name: 'Toggle left panel', exact: true }).click();
await expect(page.locator('#left-panel')).toBeHidden();
await page.getByRole('button', { name: 'Toggle right panel', exact: true }).focus();
await page.keyboard.press('Enter');
await expect(page.locator('#right-panel')).toBeHidden();
await expect(page.getByRole('button', { name: 'Toggle right panel', exact: true })).toBeFocused();
await expect(page.getByRole('button', { name: 'Toggle right panel', exact: true })).toHaveAttribute(
  'aria-expanded',
  'false',
);
const fullCanvas = await page.locator('.canvas-shell').boundingBox();
if (fullCanvas!.width < initialCanvas!.width + 590)
  throw Error('Collapsed panels did not release canvas space');
await page.screenshot({ path: 'build/evidence/panels-collapsed-browser.png' });
await page.getByRole('button', { name: 'Toggle left panel', exact: true }).click();
await expect(page.getByLabel('Find layer', { exact: true })).toHaveValue('Hello');
await page.getByRole('button', { name: 'Toggle right panel', exact: true }).focus();
await page.keyboard.press('Space');
await expect(page.locator('#right-panel')).toBeVisible();
await expect(page.locator('.inspector-heading')).toContainText('Details');
await page.getByRole('button', { name: 'Add comment', exact: true }).click();
await page.getByRole('button', { name: 'Place comment on canvas', exact: true }).press('Enter');
await page
  .getByLabel('New page comment', { exact: true })
  .fill('Draft kept when the panel is hidden');
await page.getByRole('button', { name: 'Toggle right panel', exact: true }).click();
await page.getByRole('button', { name: 'Toggle right panel', exact: true }).click();
await expect(page.getByLabel('New page comment', { exact: true })).toHaveValue(
  'Draft kept when the panel is hidden',
);
await page.getByRole('button', { name: 'Cancel', exact: true }).click();
const afterPanels = await page.evaluate(() => window.sugarMaple.dispatch('document.get'));
if (
  beforePanels.revision !== afterPanels.revision ||
  JSON.stringify(beforePanels.document) !== JSON.stringify(afterPanels.document)
)
  throw Error('Panel navigation mutated the document');
await page.screenshot({ path: 'build/evidence/browser-editor.png' });
await browser.close();
if (errors.length) throw Error(errors.join('\n'));
console.log(
  'PASS: create artboard/text/pages, edit, pointer drag, inspect code, recover on reload; no browser errors',
);
