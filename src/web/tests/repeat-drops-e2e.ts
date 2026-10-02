import { chromium, expect } from '@playwright/test';
import { strict as assert } from 'node:assert';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { repeatFixture, pixel } from '../../../tools/repeat-fixture';
const browser = await chromium.launch({ channel: 'chrome', headless: true }),
  page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const { store, grid } = repeatFixture(),
  folder = resolve('build/repeat-drops'),
  errors: string[] = [];
mkdirSync(folder, { recursive: true });
page.on('pageerror', (e) => errors.push(e.message));
const checkpoint = () => page.evaluate(() => window.sugarMaple.dispatch('document.checkpoint'));
const undo = async () => {
  await page.evaluate(async () => {
    const d = await window.sugarMaple.dispatch('document.get');
    await window.sugarMaple.dispatch('history.undo', {
      documentId: d.documentId,
      expectedRevision: d.revision,
    });
  });
  await page.evaluate(() => window.sugarMaple.dispatch('layout.inspect'));
};
const region = page.getByRole('region', { name: 'Drop Repeat Grid files', exact: true });
const png = (name: string) => ({ name, type: 'image/png', base64: pixel.split(',')[1] });
const text = (name: string, content: string) => ({ name, type: 'text/plain', text: content });
async function drop(files: any[]) {
  await region.evaluate(async (element, files) => {
    const transfer = new DataTransfer();
    for (const item of files) {
      const data = item.base64
        ? Uint8Array.from(atob(item.base64), (c) => c.charCodeAt(0))
        : item.text;
      transfer.items.add(new File([data], item.name, { type: item.type }));
    }
    element.dispatchEvent(
      new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }),
    );
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }, files);
  await expect(region).toHaveAttribute('aria-busy', 'false');
}
const preview = async () => {
  await page.getByRole('button', { name: 'Preview import', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Import validated' })).toContainText(
    '2 cells',
  );
};
const apply = async () => {
  await page.getByRole('button', { name: 'Apply grid data', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Apply grid data', exact: true })).toHaveCount(0);
};
try {
  await page.goto('http://127.0.0.1:4200');
  await page.waitForFunction(() => window.sugarMaple.ready);
  await page.evaluate(
    async ({ nodes, grid }) => {
      const d = await window.sugarMaple.dispatch('document.get');
      await window.sugarMaple.dispatch('transaction.apply', {
        documentId: d.documentId,
        expectedRevision: d.revision,
        requestId: crypto.randomUUID(),
        operations: nodes.map((node) => ({
          type: 'node.add',
          node: { ...node, pageId: d.document.pages[0].id },
        })),
      });
      await window.sugarMaple.dispatch('selection.set', { id: grid });
      await window.sugarMaple.dispatch('viewport.fit');
    },
    { nodes: store.document.nodes, grid },
  );
  let checks = 0;
  const before = await checkpoint();
  await drop([
    text('people.csv', 'title,photo\nFirst,pixel.png\nSecond,pixel.png'),
    png('pixel.png'),
  ]);
  await page.getByLabel('Map Title text', { exact: true }).selectOption('title');
  await page.getByLabel('Map Photo asset', { exact: true }).selectOption('photo');
  await preview();
  assert.deepEqual(await checkpoint(), before);
  await apply();
  const imported = await checkpoint();
  assert.equal(imported.journal.length, before.journal.length + 1);
  assert.equal(imported.journal.at(-1).origin, 'human');
  assert.equal(imported.document.nodes.find((n) => n.id === 'title').text, 'First');
  assert.equal(Object.keys(imported.document.assets).length, 1);
  checks++;
  await page.reload();
  await page.waitForFunction(() => window.sugarMaple.ready);
  assert.deepEqual((await checkpoint()).document, imported.document);
  await page.evaluate((grid) => window.sugarMaple.dispatch('selection.set', { id: grid }), grid);
  await undo();
  assert.deepEqual((await checkpoint()).document, before.document);
  checks++;
  await drop([text('labels.txt', '  First  \r\nSecond\n')]);
  await page.getByLabel('Map Title text', { exact: true }).selectOption('text');
  await preview();
  await page.getByRole('button', { name: 'Cancel import', exact: true }).click();
  assert.deepEqual((await checkpoint()).document, before.document);
  checks++;
  await drop([text('labels.txt', '  First  \r\nSecond\n')]);
  await page.getByLabel('Map Title text', { exact: true }).selectOption('text');
  await preview();
  await apply();
  assert.equal((await checkpoint()).document.nodes.find((n) => n.id === 'title').text, '  First  ');
  await undo();
  assert.deepEqual((await checkpoint()).document, before.document);
  checks++;
  const beforeImages = await checkpoint();
  await drop([png('02.png'), png('01.png')]);
  assert.deepEqual(
    JSON.parse(await page.getByLabel('Named grid data', { exact: true }).inputValue()),
    [{ image: '01.png' }, { image: '02.png' }],
  );
  await page.getByLabel('Map Photo asset', { exact: true }).selectOption('image');
  await preview();
  await apply();
  const images = await checkpoint();
  assert.equal(images.journal.at(-1).origin, 'human');
  assert.equal(images.journal.length, beforeImages.journal.length + 1);
  await undo();
  assert.deepEqual((await checkpoint()).document, before.document);
  checks++;
  const files = resolve(folder, 'images');
  mkdirSync(files, { recursive: true });
  await Bun.write(resolve(files, '02.png'), Buffer.from(pixel.split(',')[1], 'base64'));
  await Bun.write(resolve(files, '01.png'), Buffer.from(pixel.split(',')[1], 'base64'));
  await Bun.write(resolve(files, '.DS_Store'), 'fixture metadata');
  await page.getByLabel('Grid image folder', { exact: true }).setInputFiles(files);
  await expect(region).toHaveAttribute('aria-busy', 'false');
  assert.deepEqual(
    JSON.parse(await page.getByLabel('Named grid data', { exact: true }).inputValue()),
    [{ image: '01.png' }, { image: '02.png' }],
  );
  await page.getByLabel('Map Photo asset', { exact: true }).selectOption('image');
  await preview();
  assert.deepEqual((await checkpoint()).document, before.document);
  await page.getByRole('button', { name: 'Cancel import', exact: true }).click();
  checks++;
  for (const [files, pattern] of [
    [[png('same.png'), png('same.png')], /Duplicate/],
    [[png('ok.png'), text('script.js', 'alert(1)')], /Choose PNG/],
    [[text('broken.json', '[{"title":7}]')], /must be a string/],
    [[text('large.csv', 'x'.repeat(1_000_001))], /1 MB/],
  ] as const) {
    await drop(files);
    await expect(page.getByRole('alert')).toContainText(pattern);
    assert.deepEqual((await checkpoint()).document, before.document);
    await expect(page.getByRole('button', { name: 'Apply grid data', exact: true })).toHaveCount(0);
    checks++;
  }
  await drop([text('stale.csv', 'title\nFirst\nSecond')]);
  await page.getByLabel('Map Title text', { exact: true }).selectOption('title');
  await preview();
  await page.evaluate(async () => {
    const d = await window.sugarMaple.dispatch('document.get');
    await window.sugarMaple.dispatch('transaction.apply', {
      documentId: d.documentId,
      expectedRevision: d.revision,
      requestId: crypto.randomUUID(),
      operations: [{ type: 'document.rename', name: 'Concurrent import' }],
    });
  });
  await expect(page.getByRole('button', { name: 'Apply grid data', exact: true })).toHaveCount(0);
  await undo();
  checks++;
  await drop([text('people.json', '[{"title":"First"},{"title":"Second"}]')]);
  await page.getByLabel('Map Title text', { exact: true }).selectOption('title');
  await preview();
  await page.screenshot({ path: resolve(folder, 'browser.png') });
  assert.deepEqual(errors, []);
  await Bun.write(
    resolve(folder, 'browser-report.json'),
    JSON.stringify(
      {
        passed: true,
        checks,
        scope:
          'Actual browser File/DataTransfer drops and real folder input: CSV+image one human transaction, IndexedDB reopen/undo, text-list whitespace, ordered images, metadata-filtered folder, invalid-batch no mutation, cancellation and stale prepared import invalidation',
        accessibility: await page.locator('repeat-inspector').ariaSnapshot(),
      },
      null,
      2,
    ),
  );
  console.log(
    `PASS: ${checks} production Repeat Grid drop/file-folder mapping/history/recovery cases`,
  );
} finally {
  await browser.close();
}
