import { chromium, expect, type Browser } from '../../src/web/node_modules/@playwright/test';
import { strict as assert } from 'node:assert';
import { resolve } from 'node:path';
import { servePreview } from './serve';

const server = servePreview();
let browser:Browser|undefined;
const output = resolve('build/library-preview');
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } });
  const errors: string[] = [], requests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    requests.push(route.request().url());
    return new URL(route.request().url()).origin === server.url.origin ? route.continue() : route.abort();
  });
  await page.goto(server.url.href); await page.waitForFunction(() => Boolean((window as any).preview));
  await expect(page.locator('#runtime iframe')).toHaveCount(0);
  const coldStart = performance.now();
  await page.getByRole('button', { name: 'Run pinned library preview' }).click();
  await expect(page.getByRole('status')).toHaveText('Running locally');
  const coldStartMilliseconds = performance.now() - coldStart;
  const frame = page.frameLocator('#runtime iframe');
  await expect(frame.getByRole('button', { name: 'Save & Continue' })).toBeVisible();
  await frame.getByRole('button', { name: 'Save & Continue' }).click();
  await page.waitForFunction(() => (window as any).previewEvents.some((e: any) => e.kind === 'action'));
  await frame.getByRole('textbox', { name: 'Email', exact: true }).fill('changed@example.test');
  await page.waitForFunction(() => (window as any).previewEvents.some((e: any) => e.kind === 'change' && e.value === 'changed@example.test'));
  await expect(page.frameLocator('#semantic').getByRole('textbox', { name: 'Email', exact: true })).toHaveValue('changed@example.test');
  await page.getByLabel('Button label', { exact: true }).fill('Save <script>literal</script>');
  await expect(frame.getByRole('button', { name: 'Save <script>literal</script>' })).toBeVisible();
  await page.getByLabel('Button variant').selectOption('Primary');
  assert.equal(await frame.locator('wa-button').evaluate((node: any) => node.variant), 'brand');
  await page.getByLabel('Disabled button', { exact: true }).check();
  await expect(frame.getByRole('button', { name: 'Save <script>literal</script>' })).toBeDisabled();
  await page.getByLabel('Disabled button', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Run pinned library preview' }).click();
  await expect(page.getByRole('status')).toHaveText('Running locally');
  await expect(page.locator('#runtime iframe')).toHaveCount(1);
  await expect(frame.getByRole('button', { name: 'Save <script>literal</script>' })).toBeEnabled();
  const child = await (await page.locator('#runtime iframe').elementHandle())!.contentFrame();
  assert.ok(child);
  const boundary = await child.evaluate(async () => {
    let parentDenied = false, storageDenied = false, fetchDenied = false;
    try { void window.parent.document.body; } catch { parentDenied = true; }
    try { localStorage.setItem('test', 'value'); } catch { storageDenied = true; }
    try { await fetch('/forbidden-document'); } catch { fetchDenied = true; }
    return { parentDenied, storageDenied, fetchDenied,
      authoringBridge: typeof (window as any).sugarMaple,
      nativeHandlers: typeof (window as any).webkit?.messageHandlers,
      origin: self.origin,
      registeredComponent: document.querySelector('wa-button')!.constructor === customElements.get('wa-button') };
  });
  assert.deepEqual(boundary, { parentDenied: true, storageDenied: true, fetchDenied: true,
    authoringBridge: 'undefined', nativeHandlers: 'undefined', origin: 'null', registeredComponent: true });
  const before = await page.evaluate(() => (window as any).previewEvents.length);
  await child.evaluate(() => {
    window.parent.postMessage({ version: 1, kind: 'action', component: 'Button', method: 'transaction.apply', args: { file: '/private/document' } }, '*');
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.evaluate(() => (window as any).previewEvents.length), before, 'Global message forgery has no event/command route');
  const rejected = await page.evaluate(async () => {
    const w = window as any, props = structuredClone(w.previewProps);
    props.Button.props.disabled = 'not-a-boolean';
    try { await w.preview.render(props); return ''; } catch (error) { return String(error); }
  });
  assert.ok(rejected.includes('type') || rejected.includes('boolean'), rejected);
  await expect(frame.getByRole('button', { name: 'Save <script>literal</script>' })).toBeEnabled();
  await child!.evaluate(() => {
    const original = MessagePort.prototype.postMessage;
    (window as any).restorePort = () => { MessagePort.prototype.postMessage = original; };
    MessagePort.prototype.postMessage = function (value: any, ...args: any[]) {
      return (original as any).call(this, value.kind === 'action' ? { ...value, method: 'transaction.apply', file: '/private/document' } : value, ...args);
    };
  });
  const actions = await page.evaluate(() => (window as any).previewEvents.filter((e: any) => e.kind === 'action').length);
  await frame.getByRole('button', { name: 'Save <script>literal</script>' }).click();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.evaluate(() => (window as any).previewEvents.filter((e: any) => e.kind === 'action').length), actions, 'Host rejects privileged keys even on the authenticated child port');
  await child!.evaluate(() => (window as any).restorePort());
  const churn = await page.evaluate(async () => {
    const w = window as any;
    const a = structuredClone(w.previewProps); a.Button.props.label = 'Obsolete';
    const b = structuredClone(w.previewProps); b.Button.props.label = 'Latest';
    const first = w.preview.render(a).then(() => 'accepted', (error: Error) => String(error));
    const second = await w.preview.render(b); return { first: await first, second };
  });
  assert.ok(churn.first.includes('superseded')); assert.equal(churn.second.kind, 'rendered');
  await expect(frame.getByRole('button', { name: 'Latest' })).toBeVisible();
  const latency = await page.evaluate(async () => {
    const w = window as any, samples: number[] = [];
    for (let i = 0; i < 30; i++) {
      const props = structuredClone(w.previewProps); props.Button.props.label = `Measure ${i}`;
      const start = performance.now(); await w.preview.render(props); samples.push(performance.now() - start);
    }
    return samples;
  });
  await page.evaluate(() => (window as any).preview.render((window as any).previewProps));
  const accessibility = await frame.locator('body').ariaSnapshot();
  const semanticAccessibility = await page.frameLocator('#semantic').locator('body').ariaSnapshot();
  assert.ok(accessibility.includes('- paragraph: Pinned library consumer'));
  assert.ok(semanticAccessibility.includes('- paragraph: Pinned library consumer'));
  assert.ok(!accessibility.includes('- heading'), 'The runtime must preserve the fixture text role instead of inventing a heading');
  await page.screenshot({ path: resolve(output, 'comparison.png'), fullPage: true });
  await page.getByRole('button', { name: 'Stop preview' }).click();
  await expect(page.locator('#runtime iframe')).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveText('Stopped');
  const stoppedBeforeReady = await page.evaluate(async () => {
    const w = window as any, [js, css] = await Promise.all(['/runtime.js', '/runtime.css'].map(url => fetch(url).then(response => response.text())));
    const ready = w.preview.start(js, css, document.querySelector<HTMLMetaElement>('meta[name=preview-nonce]')!.content).then(() => 'unexpected ready', (error: Error) => String(error));
    w.preview.stop(); return ready;
  });
  assert.ok(stoppedBeforeReady.includes('stopped')); await expect(page.locator('#runtime iframe')).toHaveCount(0);
  const offline = requests.filter(url => new URL(url).origin !== server.url.origin);
  assert.deepEqual(offline, []); assert.deepEqual(errors, []);
  const sorted = [...latency].sort((a, b) => a - b);
  await Bun.write(resolve(output, 'browser-report.json'), JSON.stringify({ passed: true,
    scope: 'Actual pinned Web Awesome package, opaque script-only iframe, restrictive CSP, MessageChannel schema, typed props/events, atomic rejection, revision supersession, opt-in start/stop, no remote requests',
    boundary, requests, coldStartMilliseconds, updateMilliseconds: { samples: latency, p50: sorted[14], p95: sorted[28] },
    accessibility: { webAwesome: accessibility, semantic: semanticAccessibility },
    limitations: ['This iframe is not a CPU/process isolation guarantee.', 'Native WK production bridge absence is not proven by this Chrome fixture.', 'Native Swift helper, Canvas comparison and complete go/no-go remain open #51.'] }, null, 2));
  console.log('PASS: isolated real Web Awesome controls, typed props/events, denied parent/storage/network/bridge, stale rejection, malformed input, opt-in/stop and offline rendering');
} finally { try { await browser?.close(); } finally { server.stop(true); } }
