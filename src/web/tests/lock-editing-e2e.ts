import { editorURL } from './editor-url';
import { chromium, expect, type Page } from '@playwright/test';
import { strict as assert } from 'node:assert';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const get = (page: Page) => page.evaluate(() => window.sugarMaple.dispatch('document.get'));
const checkpoint = (page: Page) => page.evaluate(() => window.sugarMaple.dispatch('document.checkpoint'));
async function settle(page: Page) { await page.evaluate(() => window.sugarMaple.dispatch('layout.inspect')); }
async function select(page: Page, ids: string[]) {
  await page.evaluate(id => window.sugarMaple.dispatch('selection.set', { id }), ids[0]);
  await settle(page);
  for (const id of ids.slice(1)) await page.locator(`[data-layer-id="${id}"] [role="treeitem"]`).click({ modifiers: ['Shift'] });
}
async function tx(page: Page, operations: any[]) {
  await page.evaluate(async operations => {
    const d = await window.sugarMaple.dispatch('document.get');
    await window.sugarMaple.dispatch('transaction.apply', { documentId: d.documentId, expectedRevision: d.revision,
      requestId: crypto.randomUUID(), operations });
  }, operations); await settle(page);
}
async function undo(page: Page) {
  await page.evaluate(async () => {
    const d = await window.sugarMaple.dispatch('document.get');
    await window.sugarMaple.dispatch('history.undo', { documentId: d.documentId, expectedRevision: d.revision });
  }); await settle(page);
}
async function key(page: Page, value: string) { await page.locator('.viewport canvas').focus(); await page.keyboard.press(value); await settle(page); }
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  await context.addInitScript(() => {
    (window as any).qaClipboard = { value: '', reads: 0 };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async (text: string) => { (window as any).qaClipboard.value = text; },
      readText: async () => { (window as any).qaClipboard.reads++; return (window as any).qaClipboard.value; },
    } });
  });
  const page = await context.newPage(), errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(editorURL());
  await page.waitForFunction(() => window.sugarMaple.ready);
  const d = await get(page), pageId = d.document.pages[0].id;
  await tx(page, [
    { id: 'parent', name: 'Locked frame', kind: 'frame', width: 500, height: 400, x: 40, y: 40, locked: true, rotation: 25 },
    { id: 'child', name: 'Protected child', kind: 'rectangle', parentId: 'parent', width: 120, height: 80, x: 80, y: 90, fill: '#2563eb' },
    { id: 'text', name: 'Protected text', kind: 'text', parentId: 'parent', x: 80, y: 220, text: 'Read-only while locked' },
    { id: 'free', name: 'Free', kind: 'rectangle', x: 600, y: 40, width: 120, height: 90 },
  ].map(node => ({ type: 'node.add', node: { pageId, ...node } })));
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await select(page, ['child']);
  for (const name of ['Layer name', 'X position', 'Width', 'Fill color']) await expect(page.getByLabel(name, { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Duplicate', exact: true })).toBeDisabled();
  await expect(page.getByText('Locked by Locked frame.', { exact: false })).toBeVisible();
  await page.screenshot({ path: 'build/lock-editing-chrome.png' });
  const before = await checkpoint(page);
  await key(page, 'Delete'); assert.deepEqual(await checkpoint(page), before);
  await key(page, 'Meta+d'); assert.deepEqual(await checkpoint(page), before);
  await select(page, ['free', 'child']);
  const mixed = await checkpoint(page); await key(page, 'Delete'); assert.deepEqual(await checkpoint(page), mixed);
  await select(page, ['parent']);
  await expect(page.getByRole('button', { name: 'Add rectangle', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Add artboard', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Developer', exact: true }).click();
  await page.getByRole('button', { name: 'Copy name', exact: true }).click();
  assert.equal(await page.evaluate(() => (window as any).qaClipboard.value), 'Locked frame');
  await select(page, ['free']);
  const readonly = await checkpoint(page);
  await key(page, 'Meta+d'); await key(page, 'Meta+v'); assert.deepEqual(await checkpoint(page), readonly);
  assert.equal(await page.evaluate(() => (window as any).qaClipboard.reads), 0);
  await expect(page.getByLabel('Layer name', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Prototype', exact: true }).click();
  const prototype = await checkpoint(page); await key(page, 'Meta+d'); await key(page, 'Meta+v');
  assert.deepEqual(await checkpoint(page), prototype);
  await select(page, ['child']);
  await expect(page.getByRole('combobox', { name: 'Prototype action' })).toBeDisabled();
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Hide Protected child', exact: true }).click();
  assert.equal((await get(page)).document.nodes.find((node: any) => node.id === 'child').hidden, true);
  await undo(page); assert.equal((await get(page)).document.nodes.find((node: any) => node.id === 'child').hidden, false);
  await page.getByRole('button', { name: 'Unlock Locked frame', exact: true }).click();
  await select(page, ['child']);
  await expect(page.getByLabel('Layer name', { exact: true })).toBeEnabled();
  const unlocked = await get(page);
  await page.getByLabel('Layer name', { exact: true }).fill('Intentional edit');
  await page.getByLabel('Layer name', { exact: true }).press('Tab'); await settle(page);
  assert.equal((await get(page)).revision, unlocked.revision + 1);
  await key(page, 'Meta+z'); assert.deepEqual((await get(page)).document, unlocked.document);
  await page.getByRole('button', { name: 'Lock Protected child', exact: true }).click();
  await select(page, ['parent']);
  const contained = await checkpoint(page);
  await page.getByRole('button', { name: 'Delete', exact: true }).click(); await settle(page);
  assert.deepEqual(await checkpoint(page), contained);
  const agentBefore = await get(page);
  await tx(page, [{ type: 'node.update', id: 'child', patch: { name: 'Explicit agent edit' } }]);
  assert.equal((await get(page)).revision, agentBefore.revision + 1);
  await undo(page); assert.deepEqual((await get(page)).document, agentBefore.document);
  assert.deepEqual(errors, []); await context.close();
  console.log('PASS: inherited lock Inspector/read-only controls, mixed Delete atomicity, duplicate/insertion guards, explicit show/unlock, Developer/Prototype shortcut routing, isolated read-only copy, unlocked edit/undo and explicit agent edits');
} finally { await browser.close(); }
