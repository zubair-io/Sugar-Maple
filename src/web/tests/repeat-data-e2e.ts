import { chromium, expect } from '@playwright/test';
import { strict as assert } from 'node:assert';
import { repeatFixture, pixel } from '../../../tools/repeat-fixture';
import { repeatTargets } from '../src/app/model/repeat';
import { compile } from 'tailwindcss';
import { mkdirSync, existsSync, symlinkSync } from 'node:fs';
import { resolve } from 'node:path';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } }),
  page = await context.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
const { store, grid } = repeatFixture();
const checkpoint = () => page.evaluate(() => window.sugarMaple.dispatch('document.checkpoint'));
const data =
  'title,photo,email\nFirst,pixel.png,first@example.test\nSecond,pixel.png,second@example.test';
const image = {
  name: 'pixel.png',
  mimeType: 'image/png',
  buffer: Buffer.from(pixel.split(',')[1], 'base64'),
};
const choose = async (text = data, file = image) => {
  await page.getByLabel('Grid data format', { exact: true }).selectOption('csv');
  await page.getByLabel('Named grid data', { exact: true }).fill(text);
  await page.getByRole('button', { name: 'Read fields', exact: true }).click();
  await page.getByLabel('Map Title text', { exact: true }).selectOption('title');
  await page.getByLabel('Map Photo asset', { exact: true }).selectOption('photo');
  await page.getByLabel('Map Email initialValue', { exact: true }).selectOption('email');
  await page.getByLabel('Grid local images', { exact: true }).setInputFiles(file);
  await expect(page.getByRole('button', { name: 'Preview import', exact: true })).toBeEnabled();
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
        operations: nodes.map((n) => ({
          type: 'node.add',
          node: { ...n, pageId: d.document.pages[0].id },
        })),
      });
      await window.sugarMaple.dispatch('selection.set', { id: grid });
      await window.sugarMaple.dispatch('viewport.fit');
    },
    { nodes: store.document.nodes, grid },
  );
  const before = await checkpoint();
  await choose();
  await page.getByRole('button', { name: 'Preview import', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Import validated' })).toContainText(
    '2 cells',
  );
  await expect(page.getByRole('table', { name: 'Grid mapping preview' })).toContainText(
    'first@example.test',
  );
  assert.deepEqual(await checkpoint(), before);
  await page.getByRole('button', { name: 'Cancel import', exact: true }).click();
  assert.deepEqual(await checkpoint(), before);
  await expect(page.getByRole('button', { name: 'Apply grid data', exact: true })).toHaveCount(0);
  await page
    .getByLabel('Grid data file', { exact: true })
    .setInputFiles({ name: 'empty.json', mimeType: 'application/json', buffer: Buffer.from('[]') });
  await expect(page.getByRole('alert')).toContainText('at least one');
  assert.deepEqual(await checkpoint(), before);
  await page.getByLabel('Grid data file', { exact: true }).setInputFiles({
    name: 'large.csv',
    mimeType: 'text/csv',
    buffer: Buffer.alloc(1_000_001, 120),
  });
  await expect(page.getByRole('alert')).toContainText('1 MB');
  assert.deepEqual(await checkpoint(), before);
  await choose(data, { ...image, buffer: image.buffer.subarray(0, 33) });
  await page.getByRole('button', { name: 'Preview import', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('could not be decoded');
  assert.deepEqual(await checkpoint(), before);
  await choose(data + '\nThird,pixel.png,third@example.test');
  await page.getByRole('button', { name: 'Preview import', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('truncation');
  assert.deepEqual(await checkpoint(), before);
  await page.getByLabel('Allow truncation of rows beyond the grid').check();
  await page.getByRole('button', { name: 'Preview import', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Import validated' })).toContainText(
    '2 cells',
  );
  await page.getByRole('button', { name: 'Apply grid data', exact: true }).click();
  await expect.poll(async () => Object.keys((await checkpoint()).document.assets).length).toBe(1);
  const after = await checkpoint();
  const colors = await page.evaluate(async () => {
    const d = await window.sugarMaple.dispatch('document.get');
    const layout = await window.sugarMaple.dispatch('layout.inspect');
    const canvas = document.querySelector<HTMLCanvasElement>('canvas-surface canvas')!;
    const rect = canvas.getBoundingClientRect(),
      scale = canvas.width / rect.width;
    return d.document.nodes
      .filter((n: any) => n.kind === 'image' && n.asset.startsWith('asset:'))
      .map((n: any) => {
        const bounds = layout.nodes.find((v: any) => v.id === n.id).bounds;
        return Array.from(
          canvas
            .getContext('2d')!
            .getImageData(
              Math.floor((bounds.x + bounds.width / 2 - rect.x) * scale),
              Math.floor((bounds.y + bounds.height / 2 - rect.y) * scale),
              1,
              1,
            ).data,
        );
      });
  });
  assert.deepEqual(colors, [
    [255, 0, 0, 255],
    [255, 0, 0, 255],
  ]);

  assert.equal(after.journal.length, before.journal.length + 1);
  assert.equal(after.document.nodes.find((n: any) => n.id === 'title').text, 'First');
  const cellIDs = after.document.nodes
    .filter((n: any) => n.parentId === grid && n.repeatIndex !== null)
    .map((n: any) => n.id);
  await page.getByLabel('Grid rows', { exact: true }).fill('2');
  await page.getByLabel('Grid columns', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Resize grid', exact: true }).click();
  const resized = await checkpoint();
  assert.deepEqual(
    resized.document.nodes
      .filter((n: any) => n.parentId === grid && n.repeatIndex !== null)
      .slice(0, 2)
      .map((n: any) => n.id),
    cellIDs,
  );
  assert.equal(resized.document.nodes.find((n: any) => n.id === 'title').text, 'First');
  await page.getByRole('button', { name: 'Edit template', exact: true }).click();
  await expect(page.getByText('Editing the Repeat Grid template.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Return to Repeat Grid', exact: true }).click();
  // Template style changes preserve imported values; newly added cells inherit the changed source.
  const target = repeatTargets(resized.document, grid).find((t) => t.name === 'Title')!;
  await page.evaluate(async ({ id }) => {
    const d = await window.sugarMaple.dispatch('document.get');
    await window.sugarMaple.dispatch('transaction.apply', {
      documentId: d.documentId,
      expectedRevision: d.revision,
      requestId: crypto.randomUUID(),
      operations: [{ type: 'node.update', id, patch: { text: 'New template', color: '#123456' } }],
    });
  }, target);
  const updated = await checkpoint();
  assert.equal(updated.document.nodes.find((n: any) => n.id === 'title').text, 'First');
  await page.evaluate(async () => {
    const d = await window.sugarMaple.dispatch('document.get');
    await window.sugarMaple.dispatch('history.undo', {
      documentId: d.documentId,
      expectedRevision: d.revision,
    });
  });
  // Reject actual corrupted image bytes in the agent pipeline, before any scene/journal mutation.
  const rejected = await checkpoint();
  const corrupt = 'data:image/png;base64,' + image.buffer.subarray(0, 33).toString('base64');
  const error = await page.evaluate(async (source) => {
    const d = await window.sugarMaple.dispatch('document.get');
    try {
      await window.sugarMaple.dispatch('transaction.apply', {
        documentId: d.documentId,
        expectedRevision: d.revision,
        requestId: crypto.randomUUID(),
        operations: [
          { type: 'document.rename', name: 'Must not apply' },
          { type: 'asset.set', key: 'sha256-' + '0'.repeat(64), source },
        ],
      });
      return '';
    } catch (e) {
      return String(e);
    }
  }, corrupt);
  assert.match(error, /could not be decoded/);
  assert.deepEqual(await checkpoint(), rejected);
  // Return to a two-cell scene and validate actual image rendering in isolated/offline preview.
  await page.evaluate(async (grid) => {
    const d = await window.sugarMaple.dispatch('document.get');
    await window.sugarMaple.dispatch('transaction.apply', {
      documentId: d.documentId,
      expectedRevision: d.revision,
      requestId: crypto.randomUUID(),
      operations: [{ type: 'repeat.resize', id: grid, rows: 1, columns: 2 }],
    });
    await window.sugarMaple.dispatch('selection.set', { id: 'board' });
  }, grid);
  await context.setOffline(true);
  await page.getByRole('button', { name: '▶ Preview' }).click();
  const preview = page.getByRole('dialog', { name: 'Prototype preview', exact: true });
  await expect(preview.locator('img')).toHaveCount(2);
  await expect
    .poll(() =>
      preview
        .locator('img')
        .evaluateAll((images) =>
          images.every((image) => (image as HTMLImageElement).naturalWidth === 1),
        ),
    )
    .toBe(true);
  await expect(preview.getByRole('textbox', { name: 'Person email' }).first()).toHaveValue(
    'first@example.test',
  );
  await page.getByRole('button', { name: 'Close preview' }).click();
  await context.setOffline(false);
  const code = await page.evaluate(
    async (grid) => ({
      html: (await window.sugarMaple.dispatch('code.export', { id: grid, target: 'html' })).code,
      angular: (await window.sugarMaple.dispatch('code.export', { id: grid, target: 'angular' }))
        .code,
      tailwind: (await window.sugarMaple.dispatch('code.export', { id: grid, target: 'tailwind' }))
        .code,
      svg: (await window.sugarMaple.dispatch('code.export', { id: grid, target: 'svg' })).code,
    }),
    grid,
  );
  const folder = resolve('build/evidence/repeat-consumer');
  mkdirSync(folder, { recursive: true });
  if (!existsSync(folder + '/node_modules'))
    symlinkSync(resolve('src/web/node_modules'), folder + '/node_modules');
  await Bun.write(folder + '/template.html', code.angular);
  await Bun.write(
    folder + '/fixture.ts',
    "import {Component} from '@angular/core';\n@Component({selector:'repeat-consumer',standalone:true,templateUrl:'./template.html'}) export class Fixture {}\n",
  );
  await Bun.write(
    folder + '/tsconfig.json',
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ES2022',
        moduleResolution: 'bundler',
        experimentalDecorators: true,
        skipLibCheck: true,
        outDir: 'dist',
      },
      angularCompilerOptions: { strictTemplates: true },
      files: ['fixture.ts'],
    }),
  );
  const ngc = Bun.spawn(
    [
      process.execPath,
      resolve('src/web/node_modules/@angular/compiler-cli/bundles/src/bin/ngc.js'),
      '-p',
      folder + '/tsconfig.json',
    ],
    { stdout: 'inherit', stderr: 'inherit' },
  );
  assert.equal(await ngc.exited, 0);
  const consumer = await context.newPage();
  await consumer.setContent(code.html);
  await expect
    .poll(() =>
      consumer
        .locator('img')
        .evaluateAll((images) =>
          images.every((image) => (image as HTMLImageElement).naturalWidth === 1),
        ),
    )
    .toBe(true);
  const classes = [...code.tailwind.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(' ')),
    css = (await compile('@tailwind utilities;')).build(classes);
  await consumer.setContent('<style>' + css + '</style>' + code.tailwind);
  await expect
    .poll(() =>
      consumer
        .locator('img')
        .evaluateAll((images) =>
          images.every((image) => (image as HTMLImageElement).naturalWidth === 1),
        ),
    )
    .toBe(true);
  const source = await context.newPage();
  await source.setContent(code.svg);
  await expect(source.locator('svg image')).toHaveCount(2);
  assert.equal(await source.locator('svg image').first().getAttribute('href'), pixel);
  await page.screenshot({ path: resolve('build/evidence/repeat-import.png') });
  assert.deepEqual(errors, []);
  console.log(
    'PASS: real CSV/JSON file UI, named mappings, preview/cancel, empty/oversized/corrupt data rejection without mutation, explicit truncation, one-batch import, stable resizing, template editing, native-ready agent decode rejection, offline image preview and strict Angular/Tailwind/HTML/SVG consumers',
  );
} catch (error) {
  console.log(
    await page
      .locator('repeat-inspector')
      .innerText()
      .catch(() => ''),
  );
  throw error;
} finally {
  await browser.close();
}
