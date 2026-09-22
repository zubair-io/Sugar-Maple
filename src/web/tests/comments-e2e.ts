import { chromium, expect } from '@playwright/test';
import { strict as assert } from 'node:assert';
const b = await chromium.launch({ channel: 'chrome', headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
await p.goto('http://127.0.0.1:4200');
await p.waitForFunction(() => window.sugarMaple.ready);
await p.getByRole('button', { name: 'Add artboard', exact: true }).click();
const originalNodes = (await p.evaluate(() => window.sugarMaple.dispatch('document.get'))).document
  .nodes;
await p.getByRole('button', { name: 'Comments', exact: true }).click();
await expect(p.getByLabel('Comment scope')).toHaveCount(0);
await expect(p.getByLabel('New page comment')).toHaveCount(0);
await p.getByRole('button', { name: 'Add comment', exact: true }).click();
await p
  .getByRole('button', { name: 'Place comment on canvas' })
  .click({ position: { x: 220, y: 160 } });
await p
  .getByLabel('New page comment')
  .fill('Make the heading clearer. <script> is literal feedback.');
await p.getByRole('button', { name: 'Post comment' }).click();
let list = await p.evaluate(() => window.sugarMaple.dispatch('comments.list'));
assert.equal(list.comments.length, 1);
assert.deepEqual(
  (await p.evaluate(() => window.sugarMaple.dispatch('document.get'))).document.nodes,
  originalNodes,
);
const thread = list.comments[0],
  id = thread.id,
  firstPage = thread.pageId;
assert.equal(thread.messages[0].author, 'human');
assert.ok(Number.isFinite(thread.anchor.x) && Number.isFinite(thread.anchor.y));
const article = p.locator('page-comments article');
await expect(article).toBeFocused();
await expect(article).toHaveClass(/highlighted/);
const pin = p.getByRole('button', { name: /^Open comment:/ });
const iconBox = await pin.locator('svg').boundingBox();
const pinBox = await pin.boundingBox(),
  viewport = await p.locator('.viewport').boundingBox();
assert.ok(Math.abs(iconBox!.x + iconBox!.width / 2 - pinBox!.x - pinBox!.width / 2) < 0.5);
assert.ok(Math.abs(iconBox!.y + iconBox!.height / 2 - pinBox!.y - pinBox!.height / 2) < 0.5);
assert.ok(Math.abs(pinBox!.x + 16 - viewport!.x - 220) < 1);
assert.ok(Math.abs(pinBox!.y + 16 - viewport!.y - 160) < 1);
await p.getByRole('button', { name: 'Details', exact: true }).click();
await p.getByRole('button', { name: 'Toggle right panel' }).click();
await pin.click();
await expect(p.getByRole('button', { name: 'Comments', exact: true })).toHaveAttribute(
  'aria-pressed',
  'true',
);
await expect(article).toBeFocused();
await expect(article).toHaveClass(/pulse/);
// Changing zoom reprojects the same stored anchor.
const zoomBefore = await p.getByRole('slider', { name: 'Zoom' }).inputValue();
await p.getByRole('slider', { name: 'Zoom' }).focus();
await p.keyboard.press('ArrowRight');
await expect(p.getByRole('slider', { name: 'Zoom' })).not.toHaveValue(zoomBefore);
await expect.poll(async () => p.locator('.viewport').evaluate((el, anchor) => {
  const viewport = el.getBoundingClientRect();
  const world = el.querySelector('.world')!;
  const matrix = new DOMMatrix(getComputedStyle(world).transform);
  const pin = el.querySelector('comment-canvas button.comment-pin')!.getBoundingClientRect();
  return Math.max(
    Math.abs(pin.x + pin.width / 2 - viewport.x - (anchor.x * matrix.a + matrix.e)),
    Math.abs(pin.y + pin.height / 2 - viewport.y - (anchor.y * matrix.d + matrix.f)),
  );
}, thread.anchor)).toBeLessThan(1);
await p.getByRole('button', { name: 'Add page', exact: true }).click();
await expect(article).toHaveCount(0);
await expect(pin).toHaveCount(0);
await p.getByRole('button', { name: '▤ Page 1', exact: true }).click();
await expect(article).toHaveCount(1);
await p.getByRole('button', { name: 'Resolve', exact: true }).click();
await expect(article).toHaveCount(0);
await expect(pin).toHaveCount(0);
await p.getByLabel('Comment status').selectOption('resolved');
await expect(article).toContainText('Resolved by you');
await p.getByLabel('Reply to comment ' + id).fill('Please also use sentence case.');
await p.getByRole('button', { name: 'Reply', exact: true }).click();
await p.getByLabel('Comment status').selectOption('open');
await expect(article).toContainText('Please also use sentence case.');
await p.evaluate(() => window.sugarMaple.flushAutosave());
await p.reload();
await p.waitForFunction(() => window.sugarMaple.ready);
await p.getByRole('button', { name: /^Open comment:/ }).click();
await expect(article).toContainText('Please also use sentence case.');
list = await p.evaluate(() => window.sugarMaple.dispatch('comments.list'));
assert.deepEqual(list.comments[0].anchor, thread.anchor);
await p.evaluate(
  async ({ id, pageId }) => {
    const d = await window.sugarMaple.dispatch('document.get');
    await window.sugarMaple.dispatch('transaction.apply', {
      documentId: d.documentId,
      expectedRevision: d.revision,
      requestId: crypto.randomUUID(),
      operations: [
        { type: 'node.add', node: { pageId, kind: 'text', text: 'Your notebooks' } },
        { type: 'comment.reply', id, text: 'Added the clearer heading in sentence case.' },
        { type: 'comment.resolve', id, resolved: true },
      ],
    });
  },
  { id, pageId: firstPage },
);
await expect(pin).toHaveCount(0);
await p.getByLabel('Comment status').selectOption('resolved');
await expect(article).toContainText('Resolved by agent');
await p.getByRole('button', { name: 'Reopen', exact: true }).click();
await expect(pin).toBeVisible();
await p.getByLabel('Comment status').selectOption('open');
// Cancelling placement never creates an empty thread.
await p.getByRole('button', { name: 'Add comment', exact: true }).click();
await p.getByRole('button', { name: 'Place comment on canvas' }).press('Enter');
await p.getByLabel('New page comment').fill('Do not post');
await p.keyboard.press('Escape');
assert.equal(
  (await p.evaluate(() => window.sugarMaple.dispatch('comments.list'))).comments.length,
  1,
);
await p.screenshot({ path: 'build/evidence/page-comments-browser.png' });
await b.close();
console.log(
  'PASS: pinned placement, current-page isolation, bubble navigation/highlight, zoom projection, resolve/reply/reopen, persisted anchor, agent resolution and cancellation',
);
