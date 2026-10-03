import { editorURL } from './editor-url';
import { chromium, expect } from '@playwright/test';
import { strict as assert } from 'node:assert';
import { mkdirSync } from 'node:fs';

const url = editorURL();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors: string[] = [],
    requests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => requests.push(request.url()));
  await page.route('**/*', (route) =>
    new URL(route.request().url()).origin === url ? route.continue() : route.abort(),
  );
  await page.goto(url + '/#chrome-specimen');
  await expect(
    page.getByRole('heading', { name: 'Maple chrome specimen', exact: true }),
  ).toBeVisible();
  assert.equal(await page.evaluate(() => typeof window.sugarMaple), 'undefined');
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole('button', { name: 'Primary', exact: true }).click();
  await expect(page.getByText('Activations: 1', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Disabled', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Loading', exact: true })).toBeDisabled();
  await expect(page.getByRole('textbox', { name: 'Specimen disabled' })).toBeDisabled();
  await expect(page.getByRole('textbox', { name: 'Specimen read only' })).toHaveAttribute(
    'readonly',
    '',
  );
  const search = page.getByRole('textbox', { name: 'Specimen search' });
  await search.fill('Hello');
  await search.press('Enter');
  await expect(page.getByText('Committed input: Hello', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  const numeric = page.getByRole('textbox', { name: 'Specimen numeric' });
  await page.getByRole('button', { name: 'Increase', exact: true }).click();
  await expect(numeric).toHaveValue('6');
  for (let i = 0; i < 4; i++)
    await page.getByRole('button', { name: 'Increase', exact: true }).click();
  await expect(numeric).toHaveValue('10');
  await expect(
    page.getByRole('textbox', { name: 'First invalid input' }),
  ).toHaveAccessibleDescription('First field error');
  await expect(
    page.getByRole('textbox', { name: 'Second invalid input' }),
  ).toHaveAccessibleDescription('Second field error');
  const toolbar = page.getByRole('region', { name: 'Toolbar specimen' });
  const more = toolbar.getByRole('button', { name: 'More', exact: true });
  await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  await expect(toolbar.getByRole('button', { name: 'Unavailable', exact: true })).toBeDisabled();
  await toolbar.getByRole('dialog').press('Escape');
  await expect(toolbar.getByRole('dialog')).toHaveCount(0);
  await expect(more).toBeFocused();
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await more.click();
  await toolbar.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByText('Action: export', { exact: true })).toBeVisible();
  const nested = page.getByRole('treeitem', { name: 'Nested text', exact: true });
  await nested.focus();
  await nested.press('Space');
  await expect(page.getByText('Selected: text', { exact: true })).toBeVisible();
  await expect(nested).toHaveAttribute('aria-selected', 'true');
  await expect(nested).toHaveAttribute('aria-level', '2');
  const disabledRow = page.getByRole('treeitem', { name: 'Disabled layer', exact: true });
  await expect(disabledRow).toHaveAttribute('aria-disabled', 'true');
  await disabledRow.focus();
  await disabledRow.press('Enter');
  await expect(page.getByText('Selected: text', { exact: true })).toBeVisible();
  const root = page.getByRole('treeitem', { name: /Root frame/ });
  await root.getByRole('button', { name: 'Collapse', exact: true }).press('Enter');
  await expect(nested).toHaveCount(0);
  await expect(page.getByText('Selected: text', { exact: true })).toBeVisible();
  await root.getByRole('button', { name: 'Expand', exact: true }).click();
  await page.getByRole('tab', { name: 'Details', exact: true }).focus();
  await page.getByRole('tab', { name: 'Details', exact: true }).press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Comments', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('button', { name: 'Toggle extra inspector tab', exact: true }).click();
  const history = page.getByRole('tab', { name: 'History', exact: true });
  await history.click();
  await expect(history).toHaveAttribute('aria-selected', 'true');
  // Resize only the newly added button; the containing row's width stays fixed.
  await history.evaluate(el => { el.style.width = '210px'; });
  await expect.poll(() => page.locator('mui-tabs').evaluate(el => {
    const selected = el.querySelector('[aria-selected="true"]')!.getBoundingClientRect();
    const indicator = el.querySelector('.indicator')!.getBoundingClientRect();
    return Math.max(Math.abs(selected.x - indicator.x), Math.abs(selected.width - indicator.width));
  })).toBeLessThan(1);
  await page.getByRole('button', { name: 'Toggle extra inspector tab', exact: true }).click();
  await expect(history).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Details', exact: true })).toHaveAttribute('aria-selected', 'true');
  const fixtureStyle = () =>
    page.getByTestId('unscoped-classes').evaluate((el) => {
      const css = getComputedStyle(el);
      return { display: css.display, padding: css.padding, background: css.backgroundColor };
    });
  const inputStyle = () =>
    search.evaluate((el) => {
      const css = getComputedStyle(el),
        parent = getComputedStyle(el.parentElement!);
      return { font: css.fontFamily, color: css.color, background: parent.backgroundColor };
    });
  const authored = { display: 'block', padding: '0px', background: 'rgba(0, 0, 0, 0)' };
  assert.deepEqual(await fixtureStyle(), authored);
  const dark = await inputStyle();
  assert.ok(dark.font.includes('Lato'));
  assert.equal(dark.color, 'rgb(231, 229, 228)');
  assert.equal(dark.background, 'rgb(28, 25, 23)');
  assert.ok(
    requests.some((request) => /Lato-Regular.*\.woff2/.test(request)),
    'Chrome font was not loaded from the local bundle',
  );
  mkdirSync('build/evidence', { recursive: true });
  await page.screenshot({ path: 'build/evidence/chrome-specimen-dark.png', fullPage: true });
  await page.getByRole('combobox', { name: 'Chrome appearance' }).selectOption('light');
  assert.deepEqual(await fixtureStyle(), authored);
  const light = await inputStyle();
  assert.equal(light.color, 'rgb(41, 37, 36)');
  assert.equal(light.background, 'rgb(245, 245, 244)');
  await page.screenshot({ path: 'build/evidence/chrome-specimen-light.png', fullPage: true });
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Chrome appearance' })).toHaveValue('light');
  assert.equal((await inputStyle()).color, 'rgb(41, 37, 36)');
  await page.goto(url);
  await page.waitForFunction(() => window.sugarMaple.ready);
  await expect(page.getByRole('combobox', { name: 'Chrome appearance' })).toHaveValue('light');
  await page.getByRole('button', { name: 'Add artboard', exact: true }).click();
  await page.getByRole('button', { name: 'Add text', exact: true }).click();
  const state = await page.evaluate(() => window.sugarMaple.dispatch('document.get'));
  const nodes = state.document.nodes;
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  const rows = page.getByRole('tree', { name: 'Layers', exact: true }).getByRole('treeitem');
  const rowLayout = await page.locator('.layer-row').first().evaluate(el => {
    const tree = el.querySelector('mui-tree-row')!.getBoundingClientRect();
    const buttons = [...el.querySelectorAll(':scope > button')].map(button => button.getBoundingClientRect());
    return buttons.every(button => button.x >= tree.right - 1 && Math.abs(button.y + button.height / 2 - tree.y - tree.height / 2) < 1);
  });
  assert.ok(rowLayout, 'Layer visibility/lock controls must stay beside the tree row');
  await rows.nth(0).click();
  await rows.nth(1).click({ modifiers: ['Shift'] });
  await expect(rows.nth(0)).toHaveAttribute('aria-selected', 'true');
  await expect(rows.nth(1)).toHaveAttribute('aria-selected', 'true');
  const beforeNavigation = await page.evaluate(() => window.sugarMaple.dispatch('document.checkpoint'));
  await rows.nth(0).focus();
  await expect(page.getByRole('tree', { name: 'Layers' }).locator('[role="treeitem"][tabindex="0"]')).toHaveCount(1);
  await rows.nth(0).press('ArrowDown');
  await expect(rows.nth(1)).toBeFocused();
  await rows.nth(1).press('Home');
  await expect(rows.nth(0)).toBeFocused();
  await rows.nth(0).press('ArrowRight');
  await expect(rows.nth(1)).toBeFocused();
  await rows.nth(1).press('ArrowLeft');
  await expect(rows.nth(0)).toBeFocused();
  await rows.nth(0).press('End');
  await expect(rows.nth(1)).toBeFocused();
  assert.deepEqual(await page.evaluate(() => window.sugarMaple.dispatch('document.checkpoint')), beforeNavigation);
  await rows.nth(0).focus();
  await rows.nth(0).press('Shift+Enter');
  await expect(rows.nth(0)).toHaveAttribute('aria-selected', 'false');
  await expect(rows.nth(1)).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('textbox', { name: 'Find layer', exact: true }).fill(nodes[1].name);
  await expect(rows).toHaveCount(2); // Matching descendants retain their ancestor context.
  await page.getByRole('textbox', { name: 'Find layer', exact: true }).fill('no matching layer');
  await expect(rows).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(rows).toHaveCount(2);
  await expect(page.getByRole('textbox', { name: 'Find layer', exact: true })).toBeFocused();
  await page.evaluate(() => document.fonts.ready);
  const pixels = () =>
    page.locator('canvas-surface canvas').evaluate((el: HTMLCanvasElement) => el.toDataURL());
  const beforePixels = await pixels();
  const beforeTheme = await page.evaluate(() => window.sugarMaple.dispatch('document.get'));
  await page.getByRole('combobox', { name: 'Chrome appearance' }).selectOption('dark');
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const afterTheme = await page.evaluate(() => window.sugarMaple.dispatch('document.get'));
  assert.equal(afterTheme.revision, beforeTheme.revision);
  assert.deepEqual(afterTheme.document, beforeTheme.document);
  assert.equal(await pixels(), beforePixels, 'Chrome appearance changed authored Canvas pixels');
  await page.screenshot({ path: 'build/evidence/chrome-editor-dark.png' });
  await page.getByRole('combobox', { name: 'Chrome appearance' }).selectOption('light');
  await page.getByRole('tab', { name: 'Comments', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Page/ })).toBeVisible();
  await page.getByRole('tab', { name: 'Details', exact: true }).click();
  await expect
    .poll(() =>
      page.locator('mui-tabs').evaluate((el) => {
        const tab = el.querySelector('[aria-selected="true"]')!.getBoundingClientRect();
        const indicator = el.querySelector('.indicator')!.getBoundingClientRect();
        return Math.max(Math.abs(tab.x - indicator.x), Math.abs(tab.width - indicator.width));
      }),
    )
    .toBeLessThan(1);
  await page.screenshot({ path: 'build/evidence/chrome-editor-light.png' });
  await page.getByRole('button', { name: 'Prototype', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add artboard', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  assert.deepEqual(errors, []);
  assert.ok(
    requests.every((request) => new URL(request).origin === url),
    'Unexpected remote/backend request',
  );
  console.log(
    'PASS: Maple chrome controls, numeric bounds, per-input error descriptions, overflow focus, nested/disabled tree activation, keyboard tabs, light/dark persistence, local fonts, utility isolation, production Shift-selection/search, mode guards, unchanged document and Canvas pixels, no editor in specimen or remote requests',
  );
} finally {
  await browser.close();
}
