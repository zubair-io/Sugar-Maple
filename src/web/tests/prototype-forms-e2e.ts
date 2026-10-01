import { chromium, expect } from '@playwright/test';
import { strict as assert } from 'node:assert';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('pageerror', error => console.error('Editor page error:', error.message));
try {
  await page.goto('http://127.0.0.1:4200');
  await page.waitForFunction(() => window.sugarMaple.ready);
  await page.evaluate(async () => {
    const d = await window.sugarMaple.dispatch('document.get'), pageId = d.document.pages[0].id;
    const nodes = [
      { id: 'login', kind: 'artboard', name: 'Sign in', layout: 'vertical', width: 400, height: 600, padding: 24, gap: 12 },
      { id: 'email', parentId: 'login', kind: 'input', name: 'Email field', text: 'Email address', inputType: 'email', initialValue: 'mock@example.test', accessibleLabel: 'Email', width: 352, height: 44 },
      { id: 'password', parentId: 'login', kind: 'input', name: 'Password field', text: 'Password', inputType: 'password', initialValue: 'DemoOnly', accessibleLabel: 'Password', width: 352, height: 44 },
      { id: 'disabled', parentId: 'login', kind: 'input', name: 'Unavailable field', accessibleLabel: 'Unavailable', initialValue: 'Locked', disabled: true, width: 352, height: 44 },
      { id: 'open', parentId: 'login', kind: 'button', text: 'Open terms', prototypeAction: 'openOverlay', targetId: 'terms', width: 352, height: 44 },
      { id: 'go', parentId: 'login', kind: 'button', text: 'Continue', targetId: 'welcome', transition: 'dissolve', width: 352, height: 44 },
      { id: 'terms', kind: 'artboard', name: 'Terms overlay', layout: 'vertical', width: 320, height: 260, padding: 24, gap: 12 },
      { id: 'terms-text', parentId: 'terms', kind: 'text', text: 'These are prototype terms.', width: 272, height: 60 },
      { id: 'close', parentId: 'terms', kind: 'button', text: 'Done', prototypeAction: 'closeOverlay', width: 272, height: 44 },
      { id: 'welcome', kind: 'artboard', name: 'Welcome', width: 400, height: 600 },
    ];
    await window.sugarMaple.dispatch('transaction.apply', { documentId: d.documentId, expectedRevision: d.revision, requestId: crypto.randomUUID(), operations: nodes.map(node => ({ type: 'node.add', node: { ...node, pageId } })) });
    await window.sugarMaple.dispatch('selection.set', { id: 'login' });
    await window.sugarMaple.dispatch('viewport.fit');
  });
  const before = await page.evaluate(() => window.sugarMaple.dispatch('document.checkpoint'));
  await page.context().setOffline(true);
  await page.getByRole('button', { name: '▶ Preview' }).click();
  const preview = page.getByRole('dialog', { name: 'Prototype preview', exact: true });
  await expect(preview).toBeVisible();
  await expect(preview.locator('[data-preview-heading]')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(preview.getByRole('button', { name: 'Continue', exact: true })).toBeFocused();
  const email = preview.getByRole('textbox', { name: 'Email', exact: true }), password = preview.getByLabel('Password', { exact: true });
  await expect(email).toHaveAttribute('type', 'email');
  await expect(password).toHaveAttribute('type', 'password');
  await expect(password).toHaveValue('DemoOnly');
  await expect(preview.getByRole('textbox', { name: 'Unavailable' })).toBeDisabled();
  await email.fill('changed@example.test');
  await password.fill('RuntimeOnly');
  await page.getByRole('button', { name: 'Open terms', exact: true }).click();
  const overlay = page.getByRole('dialog', { name: 'Terms overlay', exact: true });
  await expect(overlay).toBeVisible();
  await expect(overlay.getByRole('button', { name: 'Close overlay' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(overlay.getByRole('button', { name: 'Done', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(overlay).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open terms', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Open terms', exact: true }).click();
  await overlay.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(overlay).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(preview.locator('[data-node-id="welcome"]')).toBeVisible();
  await expect(preview.locator('preview-screen .from')).toHaveCount(0);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(email).toHaveValue('changed@example.test');
  await expect(password).toHaveValue('RuntimeOnly');
  await page.getByRole('button', { name: 'Reset preview' }).click();
  await expect(email).toHaveValue('mock@example.test');
  await expect(password).toHaveValue('DemoOnly');
  assert.deepEqual(await page.evaluate(() => window.sugarMaple.dispatch('document.checkpoint')), before);
  await page.getByRole('button', { name: 'Open terms', exact: true }).click();
  assert.equal(await overlay.locator('..').evaluate(el => getComputedStyle(el).animationName), 'none');
  await page.evaluate(async () => {
    const d = await window.sugarMaple.dispatch('document.get');
    await window.sugarMaple.dispatch('transaction.apply', { documentId: d.documentId, expectedRevision: d.revision, requestId: crypto.randomUUID(), operations: [{ type: 'node.remove', id: 'terms' }] });
  });
  await expect(overlay).toHaveCount(0);
  await expect(preview.getByRole('alert')).toContainText('removed');
  await expect(page.getByRole('button', { name: 'Open terms', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Open terms', exact: true }).click();
  await expect(preview.getByRole('alert')).toContainText('no available destination');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(preview.locator('[data-node-id="welcome"]')).toBeVisible();
  await page.evaluate(async () => {
    const d = await window.sugarMaple.dispatch('document.get');
    await window.sugarMaple.dispatch('transaction.apply', { documentId: d.documentId, expectedRevision: d.revision, requestId: crypto.randomUUID(), operations: [{ type: 'node.remove', id: 'welcome' }] });
  });
  await expect(preview.locator('[data-node-id="login"]')).toBeVisible();
  await expect(preview.getByRole('alert')).toContainText('Returned to the starting artboard');
  await expect(preview.locator('[data-preview-heading]')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(preview).toHaveCount(0);
  await expect(page.getByRole('button', { name: '▶ Preview' })).toBeFocused();
  console.log('PASS: offline typed/password/disabled forms, overlay close/Escape/focus trap/restoration, reduced motion, retained navigation values, reset without authored mutation, and deleted-destination diagnostics');
} catch (error) {
  await page.screenshot({path:'build/evidence/prototype-failure.png'});
  console.error((await page.locator('body').innerText()).slice(0,2000));
  throw error;
} finally { await browser.close(); }
