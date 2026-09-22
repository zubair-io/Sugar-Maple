import { chromium, expect } from '@playwright/test';
import { strict as assert } from 'node:assert';
const b = await chromium.launch({ channel: 'chrome', headless: true }),
  p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
await p.goto('http://127.0.0.1:4200');
await p.waitForFunction(() => window.sugarMaple.ready);
await p.getByRole('button', { name: 'Comments', exact: true }).click();
await p
  .getByLabel('New page comment', { exact: true })
  .fill('Make the heading clearer. <script> is literal feedback.');
await p.getByRole('button', { name: 'Add comment', exact: true }).click();
let list = await p.evaluate(() => window.sugarMaple.dispatch('comments.list'));
assert.equal(list.comments.length, 1);
assert.equal(list.comments[0].messages[0].author, 'human');
const id = list.comments[0].id,
  firstPage = list.comments[0].pageId;
await p.getByLabel('New page comment', { exact: true }).fill('Unposted draft for Page 1');
await p.getByRole('button', { name: 'Add page', exact: true }).click();
await expect(p.getByLabel('New page comment', { exact: true })).toHaveValue('');
await expect(p.locator('page-comments article')).toHaveCount(0);
await p.getByLabel('Comment scope', { exact: true }).selectOption('all');
await p
  .locator('page-comments article')
  .getByRole('button', { name: 'Page 1', exact: true })
  .click();
await expect(p.getByLabel('New page comment', { exact: true })).toHaveValue(
  'Unposted draft for Page 1',
);
await p.getByLabel('New page comment', { exact: true }).fill('');
await p.getByRole('button', { name: 'Resolve', exact: true }).click();
await expect(p.locator('page-comments article')).toHaveCount(0);
await p.getByLabel('Comment status', { exact: true }).selectOption('resolved');
await expect(p.locator('page-comments article')).toContainText('Resolved by you');
await p
  .getByLabel('Reply to comment ' + id, { exact: true })
  .fill('Please also use sentence case.');
await p.getByRole('button', { name: 'Reply', exact: true }).click();
await p.getByLabel('Comment status', { exact: true }).selectOption('open');
await expect(p.locator('page-comments article')).toContainText('Please also use sentence case.');
await p.waitForFunction(
  (id) =>
    new Promise<boolean>((resolve, reject) => {
      const request = indexedDB.open('sugar-maple', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const read = db.transaction('checkpoints').objectStore('checkpoints').get('active');
        read.onsuccess = () => {
          const thread = read.result?.document.comments.find((c: any) => c.id === id);
          db.close();
          resolve(thread?.messages.length === 2 && !thread.resolved);
        };
        read.onerror = () => {
          db.close();
          reject(read.error);
        };
      };
    }),
  id,
);
await p.reload();
await p.waitForFunction(() => window.sugarMaple.ready);
await p.getByRole('button', { name: 'Comments', exact: true }).click();
await expect(p.locator('page-comments article')).toContainText('Please also use sentence case.');
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
await p.getByLabel('Comment status', { exact: true }).selectOption('resolved');
await expect(p.locator('page-comments article')).toContainText('Resolved by agent');
await expect(p.locator('page-comments article')).toContainText('Added the clearer heading');
await p.getByRole('button', { name: 'Reopen', exact: true }).click();
await p.getByLabel('Comment status', { exact: true }).selectOption('open');
await expect(p.locator('page-comments article')).toBeVisible();
await p.screenshot({ path: 'build/evidence/page-comments-browser.png' });
await b.close();
console.log(
  'PASS: page feedback, draft isolation, all-page navigation, resolve/reply/reopen, real recovery, agent reply and resolution',
);
