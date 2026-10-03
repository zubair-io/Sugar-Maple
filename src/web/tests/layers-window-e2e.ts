import { editorURL } from './editor-url';
import { chromium, expect } from '@playwright/test';
import { strict as assert } from 'node:assert';
import { blankDocument, NodeSchema } from '../src/app/model/schema';
import { DocumentStore } from '../src/app/model/store';

const url = editorURL();
const doc = blankDocument('Large layer tree');
for (let group = 0; group < 50; group++) {
  const parentId = 'group-' + group;
  doc.nodes.push(NodeSchema.parse({ id: parentId, pageId: doc.pages[0].id,
    kind: 'frame', name: 'Group ' + group, x: group * 1000, width: 500, height: 500 }));
  for (let child = 0; child < 199; child++) doc.nodes.push(NodeSchema.parse({
    id: `layer-${group}-${child}`, parentId, pageId: doc.pages[0].id,
    kind: 'text', name: group === 49 && child === 198 ? 'Needle deep' : `Layer ${group}-${child}`,
    text: 'Editable', x: child % 10 * 40, y: Math.floor(child / 10) * 20, width: 40, height: 20,
  }));
}
const fixture = new DocumentStore(doc).checkpoint();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  // Fixed recovery/status/autosave bridge only: no clipboard, file or MCP capability.
  await page.addInitScript(fixture => {
    window.webkit = { messageHandlers: { native: { postMessage: async (message: any) => {
      if (message.action === 'recovery.load') return fixture;
      if (message.action === 'status') return { status: 'Isolated layer fixture' };
      if (message.action === 'file.autosave') return { ok: true, managed: true };
      throw Error('Unexpected layer fixture bridge action: ' + message.action);
    } } } };
  }, fixture);
  await page.goto(url);
  await page.waitForFunction(() => window.sugarMaple.ready);
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  const tree = page.getByRole('tree', { name: 'Layers', exact: true });
  const item = (id: string) => tree.locator(`[data-layer-id="${id}"] [role="treeitem"]`);
  await expect(tree).toHaveAttribute('data-layer-count', '10000');
  await expect.poll(() => tree.getByRole('treeitem').count()).toBeLessThan(60);
  const checkpoint = await page.evaluate(() => window.sugarMaple.dispatch('document.checkpoint'));
  await item('group-0').focus();
  await expect(item('group-0')).toHaveAttribute('aria-setsize', '50');
  await expect(item('group-0')).toHaveAttribute('aria-posinset', '1');
  await item('group-0').press('ArrowRight');
  await expect(item('layer-0-0')).toBeFocused();
  await expect(item('layer-0-0')).toHaveAttribute('aria-setsize', '199');
  await item('layer-0-0').press('End');
  await expect(item('layer-49-198')).toBeFocused();
  await expect(item('layer-49-198')).toBeVisible();
  await expect(item('layer-49-198')).toHaveAttribute('aria-posinset', '199');
  await item('layer-49-198').press('ArrowLeft');
  await expect(item('group-49')).toBeFocused();
  await item('group-49').press('Home');
  await expect(item('group-0')).toBeFocused();
  // Arrow navigation crosses multiple mounted windows without changing authored nodes/history.
  for (let index = 0; index < 70; index++) await page.keyboard.press('ArrowDown');
  await expect(item('layer-0-69')).toBeFocused();
  assert.deepEqual(await page.evaluate(() => window.sugarMaple.dispatch('document.checkpoint')), checkpoint);
  // Scroll away while a visibility control has focus: retain that actual DOM control.
  await page.keyboard.press('Home');
  const hide = tree.getByRole('button', { name: 'Hide Group 0', exact: true });
  await page.evaluate(() => window.sugarMaple.dispatch('selection.set', { id: 'group-0' }));
  await hide.focus();
  const beforeControlArrow = await page.evaluate(() => window.sugarMaple.dispatch('document.checkpoint'));
  await hide.press('ArrowRight');
  assert.deepEqual(await page.evaluate(() => window.sugarMaple.dispatch('document.checkpoint')), beforeControlArrow);
  await tree.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect(hide).toBeFocused();
  await expect.poll(() => tree.getByRole('treeitem').count()).toBeLessThan(60);
  await hide.press('Space');
  await expect(tree.getByRole('button', { name: 'Show Group 0', exact: true })).toBeFocused();
  const hidden = await page.evaluate(() => window.sugarMaple.dispatch('document.checkpoint'));
  assert.equal(hidden.document.nodes[0].hidden, true);
  assert.equal(hidden.journal.length, checkpoint.journal.length + 1);
  await page.keyboard.press('Meta+z');
  assert.deepEqual((await page.evaluate(() => window.sugarMaple.dispatch('document.get'))).document, checkpoint.document);
  // A Canvas/MCP selection can reveal a row that was never mounted.
  await page.evaluate(() => window.sugarMaple.dispatch('selection.set', { id: 'layer-49-198' }));
  await expect(item('layer-49-198')).toBeVisible();
  await expect(item('layer-49-198')).toHaveAttribute('aria-selected', 'true');
  await item('layer-49-198').click();
  await page.keyboard.press('Home');
  await item('group-0').click({ modifiers: ['Shift'] });
  assert.deepEqual((await page.evaluate(() => window.sugarMaple.dispatch('editor.discover'))).selectionIds, ['layer-49-198', 'group-0']);
  const search = page.getByRole('textbox', { name: 'Find layer', exact: true });
  await search.fill('Needle deep');
  await expect(tree.getByRole('treeitem')).toHaveCount(2);
  await expect(item('group-49')).toHaveAttribute('aria-setsize', '1');
  await expect(item('layer-49-198')).toHaveAttribute('aria-posinset', '1');
  await search.fill('absent match');
  await expect(tree.getByRole('treeitem')).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(search).toBeFocused();
  await expect(tree).toHaveAttribute('data-layer-count', '10000');
  await page.setViewportSize({ width: 1200, height: 650 });
  await expect.poll(() => tree.getByRole('treeitem').count()).toBeLessThan(50);
  await page.getByRole('button', { name: 'Tokens', exact: true }).click();
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await expect(tree).toHaveAttribute('data-layer-count', '10000');
  await expect.poll(() => tree.getByRole('treeitem').count()).toBeLessThan(50);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: 'build/evidence/virtual-layers-browser.png' });
  console.log('PASS: 10,000-layer bounded DOM, sibling ARIA, off-window keyboard navigation, focused control retention, single-step visibility/undo, external selection reveal, Shift-selection, contextual search, resize and panel recreation');
} finally { await browser.close(); }
