import { chromium, expect, type Page } from '@playwright/test';
import { strict as assert } from 'node:assert';
import { embeddedAsset } from '../src/app/model/assets';
import { pixel } from '../../../tools/repeat-fixture';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const get = (page: Page) => page.evaluate(() => window.sugarMaple.dispatch('document.get'));
const checkpoint = (page: Page) => page.evaluate(() => window.sugarMaple.dispatch('document.checkpoint'));
const settle = (page: Page) => page.evaluate(() => window.sugarMaple.dispatch('layout.inspect'));
async function failure(page: Page, method: string, extra: any = {}) {
  return page.evaluate(async ({ method, extra }) => {
    const d = await window.sugarMaple.dispatch('document.get');
    try { await window.sugarMaple.dispatch(method, { documentId: d.documentId, expectedRevision: d.revision, ...extra }); return ''; }
    catch (error) { return String(error); }
  }, { method, extra });
}
async function select(page: Page, id: string) { await page.evaluate(id => window.sugarMaple.dispatch('selection.set', { id }), id); await settle(page); }
async function undo(page: Page) {
  await page.evaluate(async () => { const d = await window.sugarMaple.dispatch('document.get');
    await window.sugarMaple.dispatch('history.undo', { documentId: d.documentId, expectedRevision: d.revision }); }); await settle(page);
}
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } }), errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(process.env.SUGAR_MAPLE_TEST_URL ?? 'http://127.0.0.1:4200'); await page.waitForFunction(() => window.sugarMaple.ready);
  await page.evaluate(async () => {
    const d = await window.sugarMaple.dispatch('document.get');
    await window.sugarMaple.dispatch('transaction.apply', { documentId: d.documentId, expectedRevision: d.revision, requestId: crypto.randomUUID(),
      operations: [{ id: 'a', name: 'Alpha label', text: 'Alpha', x: 40 }, { id: 'b', name: 'Beta label', text: 'Beta', x: 250 }]
        .map(node => ({ type: 'node.add', node: { ...node, pageId: d.document.pages[0].id, kind: 'text', y: 40, width: 180, height: 80 } })) });
  });
  await page.getByRole('button', { name: 'Layers', exact: true }).click(); await select(page, 'a');
  const field = page.getByLabel('Text content', { exact: true }), before = await checkpoint(page);
  await field.fill('Café — 日本語\nHuman draft'); await field.press('ArrowLeft');
  const caret = await field.evaluate((field: HTMLTextAreaElement) => ({ start: field.selectionStart, end: field.selectionEnd }));
  await settle(page); assert.deepEqual(await checkpoint(page), before);
  assert.deepEqual(await field.evaluate((field: HTMLTextAreaElement) => ({ start: field.selectionStart, end: field.selectionEnd })), caret);
  await expect(field).toBeFocused();
  assert.ok((await failure(page, 'render.ready')).includes('Finish or cancel'));
  assert.ok((await failure(page, 'transaction.apply', { requestId: crypto.randomUUID(), operations: [{ type: 'document.rename', name: 'Agent while typing' }] })).includes('Finish or cancel'));
  assert.ok((await failure(page, 'history.undo')).includes('Finish or cancel'));
  assert.deepEqual(await checkpoint(page), before);
  await select(page, 'b');
  const committed = await get(page), committedCheckpoint = await checkpoint(page);
  assert.equal(committed.revision, 2); assert.equal(committedCheckpoint.journal.length, before.journal.length + 1);
  assert.equal(committedCheckpoint.journal.at(-1).origin, 'human');
  assert.equal(committed.document.nodes.find((node: any) => node.id === 'a').text, 'Café — 日本語\nHuman draft');
  assert.equal(committed.document.nodes.find((node: any) => node.id === 'b').text, 'Beta');
  await expect(field).toHaveValue('Beta'); await expect(field).not.toBeFocused();
  await undo(page); assert.deepEqual((await get(page)).document, before.document);
  await select(page, 'a'); const compositionBefore = await checkpoint(page);
  await field.focus();
  await field.evaluate((field: HTMLTextAreaElement) => {
    field.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    field.value = '仮の入力'; field.setSelectionRange(2, 2);
    field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertCompositionText', isComposing: true, data: field.value }));
  });
  const compositionSelectionError = await page.evaluate(async () => { try { await window.sugarMaple.dispatch('selection.set', { id: 'b' }); return ''; }
    catch (error) { return String(error); } });
  assert.ok(compositionSelectionError.includes('Finish text composition'));
  assert.deepEqual(await checkpoint(page), compositionBefore); await expect(field).toHaveValue('仮の入力');
  assert.equal(await field.evaluate((field: HTMLTextAreaElement) => field.selectionStart), 2);
  await page.getByRole('button', { name: 'Developer', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Design', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(field).toHaveValue('仮の入力'); assert.deepEqual(await checkpoint(page), compositionBefore);
  await field.evaluate((field: HTMLTextAreaElement) => {
    field.value = '確定した入力'; field.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: field.value }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  }); await settle(page);
  const compositionAfter = await checkpoint(page);
  assert.equal(compositionAfter.journal.length, compositionBefore.journal.length + 1);
  assert.equal(compositionAfter.document.nodes.find((node: any) => node.id === 'a').text, '確定した入力');
  await undo(page); assert.deepEqual((await get(page)).document, compositionBefore.document);
  await select(page, 'a'); const canceled = await checkpoint(page);
  await field.fill('Cancel this edit'); await field.press('Escape'); await settle(page);
  assert.deepEqual(await checkpoint(page), canceled); await expect(field).toHaveValue('Alpha');
  await field.fill('Cancel by pointer');
  await page.getByRole('button', { name: 'Cancel text edit', exact: true }).click(); await settle(page);
  assert.deepEqual(await checkpoint(page), canceled); await expect(field).toHaveValue('Alpha');
  await field.fill('Cancel by keyboard'); await field.press('Tab');
  const cancelButton = page.getByRole('button', { name: 'Cancel text edit', exact: true });
  await expect(cancelButton).toBeFocused(); assert.deepEqual(await checkpoint(page), canceled);
  await cancelButton.press('Enter'); await settle(page);
  assert.deepEqual(await checkpoint(page), canceled); await expect(field).toHaveValue('Alpha');
  await field.fill('x'.repeat(20001)); await field.press('Tab'); await settle(page);
  assert.deepEqual(await checkpoint(page), canceled); await expect(field).toHaveValue('x'.repeat(20001));
  await page.getByRole('button', { name: 'Cancel text edit', exact: true }).click();
  await expect(field).toHaveValue('Alpha'); assert.deepEqual(await checkpoint(page), canceled);
  // Hold a real image decode so a human draft can begin after agent validation starts.
  const raceBefore = await checkpoint(page), asset = embeddedAsset(pixel);
  await page.evaluate(async ({ key, source }) => {
    const qa = window as any, OriginalImage = window.Image;
    const src = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')!;
    qa.textDecodeStarted = false;
    qa.restoreTextDecode = () => { window.Image = OriginalImage; };
    window.Image = function () {
      const image = new OriginalImage();
      Object.defineProperty(image, 'src', {
        get: () => src.get!.call(image),
        set: value => {
          qa.releaseTextDecode = () => src.set!.call(image, value);
          qa.textDecodeStarted = true;
        },
      });
      return image;
    } as any;
    const d = await window.sugarMaple.dispatch('document.get');
    qa.textDecodeResult = window.sugarMaple.dispatch('transaction.apply', {
      documentId: d.documentId, expectedRevision: d.revision, requestId: crypto.randomUUID(),
      operations: [{ type: 'asset.set', key, source }, { type: 'document.rename', name: 'Agent decode race' }],
    }).then(() => '', (error: unknown) => String(error));
  }, { key: asset.key, source: pixel });
  try {
    await page.waitForFunction(() => (window as any).textDecodeStarted);
    await field.fill('Human starts during image decode'); await field.press('ArrowLeft');
    const raceCaret = await field.evaluate((field: HTMLTextAreaElement) => field.selectionStart);
    const raceError = await page.evaluate(async () => {
      const qa = window as any; qa.releaseTextDecode(); return await qa.textDecodeResult;
    });
    assert.ok(raceError.includes('Finish or cancel'), raceError);
    assert.deepEqual(await checkpoint(page), raceBefore);
    await expect(field).toHaveValue('Human starts during image decode'); await expect(field).toBeFocused();
    assert.equal(await field.evaluate((field: HTMLTextAreaElement) => field.selectionStart), raceCaret);
    await field.press('Escape'); assert.deepEqual(await checkpoint(page), raceBefore);
  } finally { await page.evaluate(() => (window as any).restoreTextDecode()); }
  await field.fill('Human layer switch'); await page.locator('[data-layer-id="b"] [role="treeitem"]').click(); await settle(page);
  assert.equal((await get(page)).document.nodes.find((node: any) => node.id === 'a').text, 'Human layer switch');
  await undo(page); assert.deepEqual((await get(page)).document, canceled.document);
  await select(page, 'a'); const fileBefore = await get(page);
  await field.fill('Saved before New');
  await page.evaluate(() => window.sugarMaple.dispatch('document.new', { name: 'Text editing other file' }));
  await page.getByRole('tab', { name: fileBefore.document.name, exact: true }).click(); await settle(page);
  assert.equal((await get(page)).document.nodes.find((node: any) => node.id === 'a').text, 'Saved before New');
  await undo(page); assert.deepEqual((await get(page)).document, fileBefore.document);
  assert.deepEqual(errors, []);
  console.log('PASS: native textarea draft/caret, Unicode/multiline, selection/file context commit, one human undo, deferred synthetic composition, read-only mode guard, capture/agent/history rejection including delayed image decode, cancel and oversized draft preservation; actual OS IME is separate');
} finally { await browser.close(); }
