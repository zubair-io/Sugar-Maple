import { chromium, expect } from '@playwright/test';
import { strict as assert } from 'node:assert';
import { webAwesomeManifest as manifest } from '../../../tools/library-fixture';
import { libraryKey } from '../src/app/model/library-schema';
const browser = await chromium.launch({ channel: 'chrome', headless: true }),
  page = await browser.newPage({ viewport: { width: 1440, height: 1100 } }),
  errors: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));
const checkpoint = () => page.evaluate(() => window.sugarMaple.dispatch('document.checkpoint'));
const key = libraryKey(manifest);
try {
  await page.goto('http://127.0.0.1:4200');
  await page.waitForFunction(() => window.sugarMaple.ready);
  await page.getByRole('button', { name: 'Assets', exact: true }).click();
  const contrast = await page
    .getByLabel('Library manifest', { exact: true })
    .evaluate((control) => {
      const style = getComputedStyle(control);
      const luminance = (color: string) => {
        const channels = color
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number)
          .map((channel) => {
            const s = channel / 255;
            return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          });
        return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
      };
      const fg = luminance(style.color),
        bg = luminance(style.backgroundColor);
      return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
    });
  assert.ok(contrast >= 4.5, `Library manifest text contrast was ${contrast}`);
  const before = await checkpoint();
  await page.getByRole('button', { name: 'Preview Web Awesome 3.14.0', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Validated Web Awesome' })).toBeVisible();
  assert.deepEqual(await checkpoint(), before);
  await page.getByRole('button', { name: 'Cancel library import', exact: true }).click();
  assert.deepEqual(await checkpoint(), before);
  const malformed = structuredClone(manifest);
  malformed.components.Button.props.disabled.webAttribute = 'onclick';
  await page.getByLabel('Library manifest file', { exact: true }).setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(malformed)),
  });
  await expect(
    page.getByRole('alert').filter({ hasText: 'Unsupported web attribute' }),
  ).toBeVisible();
  assert.deepEqual(await checkpoint(), before);
  await page.getByLabel('Library manifest file', { exact: true }).setInputFiles({
    name: 'manifest.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(manifest)),
  });
  await expect(page.getByRole('button', { name: 'Import library', exact: true })).toBeVisible();
  assert.deepEqual(await checkpoint(), before);
  await page.getByRole('button', { name: 'Cancel library import', exact: true }).click();
  assert.deepEqual(await checkpoint(), before);
  await page.getByLabel('Library manifest file', { exact: true }).setInputFiles({
    name: 'manifest.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(manifest)),
  });
  await expect(page.getByRole('button', { name: 'Import library', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Import library', exact: true }).click();
  const imported = await checkpoint();
  assert.equal(imported.journal.length, before.journal.length + 1);
  assert.ok(imported.document.libraries[key]);
  await page.getByRole('button', { name: 'Insert library Button ' + key, exact: true }).click();
  await page.getByLabel('Library prop label', { exact: true }).fill('Save from actual picker');
  await page.getByLabel('Library prop label', { exact: true }).press('Tab');
  await page.getByLabel('Library variant', { exact: true }).selectOption('Disabled');
  const applied = await checkpoint(),
    node = applied.document.nodes.find((n: any) => n.libraryRef);
  assert.equal(node.text, 'Save from actual picker');
  assert.equal(node.disabled, true);
  assert.equal(node.libraryRef.variant, 'Disabled');
  await page.evaluate(async (id) => {
    const d = await window.sugarMaple.dispatch('document.get');
    await window.sugarMaple.dispatch('transaction.apply', {
      documentId: d.documentId,
      expectedRevision: d.revision,
      requestId: crypto.randomUUID(),
      operations: [{ type: 'node.update', id, patch: { text: 'Local override' } }],
    });
  }, node.id);
  await page.getByLabel('Library prop label', { exact: true }).fill('Changed source prop');
  await page.getByLabel('Library prop label', { exact: true }).press('Tab');
  assert.equal(
    (await checkpoint()).document.nodes.find((n: any) => n.id === node.id).text,
    'Local override',
  );
  const snapshot = await checkpoint();
  await page.reload();
  await page.waitForFunction(() => window.sugarMaple.ready);
  assert.deepEqual(await checkpoint(), snapshot);
  await page.evaluate((id) => window.sugarMaple.dispatch('selection.set', { id }), node.id);
  await expect(page.getByRole('region', { name: 'Library component identity' })).toContainText(key);
  await page.getByRole('button', { name: 'Reset library overrides', exact: true }).click();
  assert.equal(
    (await checkpoint()).document.nodes.find((n: any) => n.id === node.id).text,
    'Button',
  );
  const web = await page.evaluate(
    (id) => window.sugarMaple.dispatch('code.export', { id, target: 'web-library' }),
    node.id,
  );
  assert.ok(web.code.includes('<wa-button'));
  assert.ok(web.code.includes('@awesome.me/webawesome@3.14.0'));
  const native = await page.evaluate(
    (id) => window.sugarMaple.dispatch('code.export', { id, target: 'swift-library' }),
    node.id,
  );
  assert.ok(native.code.includes('Button('));
  await page.screenshot({ path: 'build/evidence/library-picker.png' });
  assert.deepEqual(errors, []);
  console.log(
    'PASS: real manifest file validation/preview/cancel, atomic import, library picker, typed props/variants/local overrides, reload identity and mapped export targets',
  );
} finally {
  await browser.close();
}
