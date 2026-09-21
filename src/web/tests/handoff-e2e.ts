import { chromium, expect } from '@playwright/test';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://127.0.0.1:4200');
  await page.getByRole('button', { name: 'Assets', exact: true }).click();
  await page
    .locator('input[type=file]')
    .setInputFiles({
      name: 'mark.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M 0 0 L 100 0 L 50 100 Z" fill="#2563eb"/></svg>',
      ),
    });
  await expect(page.locator('[data-node-id]')).toHaveCount(2);
  const doc = await page.evaluate(() => window.sugarMaple.dispatch('document.get'));
  const vector = doc.document.nodes.find((n: any) => n.kind === 'path');
  await page.evaluate((id) => window.sugarMaple.dispatch('selection.set', { id }), vector.id);
  await page.getByRole('button', { name: 'Developer', exact: true }).click();
  await page.getByRole('combobox', { name: 'Export target' }).selectOption('svg');
  await expect(page.locator('pre')).toContainText('M 0 0 L 100 0 L 50 100 Z');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PNG', exact: true }).click();
  const file = await download;
  await file.saveAs('build/evidence/imported-vector.png');
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page
    .locator('input[type=file]')
    .setInputFiles({
      name: 'unsafe.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      ),
    });
  await expect(page.getByRole('alert')).toContainText('Unsupported SVG element');
  await expect(page.locator('[data-node-id]')).toHaveCount(2);
  console.log(
    'PASS: SVG import, actual path rendering, SVG code and PNG download, script-bearing SVG rejection',
  );
} finally {
  await browser.close();
}
