import { chromium, expect } from '@playwright/test';
import { strict as assert } from 'node:assert';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
await page.goto('http://127.0.0.1:4200');
await page.waitForFunction(() => window.sugarMaple.ready);
await page.getByRole('button', { name: 'Add button', exact: true }).click();
await page.getByRole('button', { name: 'Make component', exact: true }).click();
await page.getByLabel('Variant name', { exact: true }).fill('Pressed');
await page.getByRole('button', { name: 'Add variant', exact: true }).click();
await page.getByRole('button', { name: 'Assets', exact: true }).click();
await page.getByRole('button', { name: 'Insert component button', exact: true }).click();
await page.getByLabel('Variant', { exact: true }).selectOption('Pressed');
let state = await page.evaluate(() => window.sugarMaple.dispatch('document.get'));
const instance = state.document.nodes.find((n: any) => n.componentId);
assert.equal(instance.fill, '#475569');
await page.getByLabel('Text', { exact: true }).fill('Local label');
await page.getByLabel('Text', { exact: true }).blur();
await page.getByRole('button', { name: 'Reset overrides', exact: true }).click();
await expect(page.getByLabel('Text', { exact: true })).toHaveValue('Continue');
await page.reload();
await page.waitForFunction(() => window.sugarMaple.ready);
await page.evaluate((id) => window.sugarMaple.dispatch('selection.set', { id }), instance.id);
await page.getByRole('button', { name: 'Developer', exact: true }).click();
await expect(page.locator('.inspector')).toContainText('Variant: Pressed');
await browser.close();
console.log(
  'PASS: create component variant, insert instance, switch state, override and reset, recover developer identity',
);
