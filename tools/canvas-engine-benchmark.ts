import { chromium } from '../src/web/node_modules/@playwright/test';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { canvasBenchmarkFixture } from './canvas-benchmark-fixture';

const root = resolve(import.meta.dir, '..');
const output = resolve(root, 'build/canvas-engine-benchmark');
mkdirSync(output, { recursive: true });
const resources = resolve(root, 'src/web/dist/sugar-maple-editor/browser');
if (!await Bun.file(resolve(resources, 'index.html')).exists()) throw Error('Run bun run build:web first');
const harness = await Bun.file(resolve(import.meta.dir, 'canvas-benchmark-page.js')).text();
const recoveryBuild = await Bun.build({ entrypoints: [resolve(root, 'src/web/src/app/model/recovery.ts')], target: 'browser', format: 'esm' });
if (!recoveryBuild.success) throw Error('Could not bundle the real browser recovery store for fixture setup');
const seedModule = await recoveryBuild.outputs[0].text() + '\nwindow.seedBenchmark = value => new RecoveryStore().write(value);';
// Own an ephemeral loopback server. Do not reuse a possibly stale dev server.
const server = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(request) {
  const pathname = decodeURIComponent(new URL(request.url).pathname);
  if (pathname === '/benchmark-seed') return new Response('<!doctype html><title>Isolated benchmark fixture setup</title>', { headers: { 'Content-Type': 'text/html' } });
  const file = resolve(resources, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(resources + '/')) return new Response('Denied', { status: 403 });
  const body = Bun.file(file);
  return await body.exists() ? new Response(body) : new Response('Missing', { status: 404 });
} });
async function command(cmd: string[], stdout: 'pipe' | 'inherit' = 'pipe') {
  const process = Bun.spawn(cmd, { cwd: root, stdout, stderr: 'inherit' });
  const text = stdout === 'pipe' ? await new Response(process.stdout).text() : '';
  if (await process.exited) throw Error(`Benchmark command failed: ${cmd[0]}`);
  return text.trim();
}
const environment = { date: new Date().toISOString(), source: await command(['git', 'rev-parse', 'HEAD']),
  build: 'Angular production editor, current working tree', platform: process.platform,
  bun: Bun.version,
  swift: process.platform === 'darwin' ? await command(['swiftc', '--version']) : null,
  xcode: process.platform === 'darwin' ? await command(['xcodebuild', '-version']) : null,
  hardware: process.platform === 'darwin' ? await command(['sysctl', '-n', 'machdep.cpu.brand_string', 'hw.memsize']) : null,
  os: process.platform === 'darwin' ? await command(['sw_vers']) : null,
  viewport: { width: 1440, height: 1000 }, nominalP95BudgetMs: 16.7 };
await Bun.write(resolve(output, 'run-state.json'), JSON.stringify({ state: 'running', environment }, null, 2));
const browser = await chromium.launch({ channel: 'chrome', headless: false });
try {
  const rootCDP = await browser.newBrowserCDPSession();
  for (const total of [1000, 10000] as const) {
    const fixture = canvasBenchmarkFixture(total);
    await Bun.write(resolve(output, `fixture-${total}.json`), JSON.stringify(fixture));
    const context = await browser.newContext({ viewport: environment.viewport, deviceScaleFactor: 2 });
    try {
      const page = await context.newPage();
      await page.goto(new URL('/benchmark-seed', server.url).href);
      await page.addScriptTag({ type: 'module', content: seedModule });
      await page.waitForFunction(() => typeof (window as any).seedBenchmark === 'function');
      await page.evaluate(value => (window as any).seedBenchmark(value), fixture);
      const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      await cdp.send('Performance.enable');
      const trace: unknown[] = []; cdp.on('Tracing.dataCollected', data => trace.push(...data.value));
      await cdp.send('Tracing.start', { categories: 'devtools.timeline,blink.user_timing,cc,benchmark,toplevel', transferMode: 'ReportEvents' });
      await page.goto(server.url.href);
      await page.waitForFunction(() => window.sugarMaple?.ready, null, { timeout: 30000 });
      await page.bringToFront();
      await page.evaluate(harness);
      const result = await page.evaluate(total => (window as any).canvasBenchmark(total), total);
      const memory = await cdp.send('Performance.getMetrics');
      const processes = await rootCDP.send('SystemInfo.getProcessInfo');
      const processRSS = process.platform === 'darwin' ? await command(['ps', '-p', processes.processInfo.map(p => p.id).join(','), '-o', 'pid=,rss=,comm=']) : null;
      // Also prove a trusted browser wheel reaches the same path. Its latency is
      // not conflated with the shared synthetic timing samples above.
      const canvas = await page.locator('.viewport canvas').boundingBox(); assert.ok(canvas);
      const before = await page.evaluate(() => window.sugarMaple.viewport.camera());
      await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
      await page.mouse.wheel(12, 8);
      await page.waitForFunction(value => JSON.stringify(window.sugarMaple.viewport.camera()) !== JSON.stringify(value), before);
      await page.screenshot({ path: resolve(output, `chrome-${total}.png`) });
      const stopped = new Promise<void>(resolve => cdp.once('Tracing.tracingComplete', () => resolve()));
      await cdp.send('Tracing.end'); await stopped;
      await Bun.write(resolve(output, `chrome-${total}.trace.json.gz`), Bun.gzipSync(JSON.stringify({ traceEvents: trace })));
      assert.deepEqual(errors, []);
      await Bun.write(resolve(output, `chrome-${total}.json`), JSON.stringify({ environment, engine: browser.version(), result,
        trustedBrowserWheelVerified: true, memory: { cdpMetrics: memory.metrics, processRSS,
          scope: 'CDP JS heap and an instantaneous RSS snapshot of the owned Chrome process IDs; shared pages may be double-counted' } }, null, 2));
      console.log(JSON.stringify({ engine: 'Chrome', total, startupMs: result.startup.navigationToObservedPaintMs,
        phases: result.phases.map((p: any) => ({ mode: p.mode, frameP95: p.frameIntervalMs.p95, inputP95: p.inputToObservedPaintMs?.p95, painted: p.drawnRange })) }));
    } finally { await context.close(); }
  }
} finally { await browser.close(); server.stop(true); }

if (process.platform === 'darwin') {
  const bundle = resolve(output, 'Sugar Maple Canvas Benchmark.app');
  const executable = resolve(bundle, 'Contents/MacOS/native-benchmark');
  mkdirSync(resolve(bundle, 'Contents/MacOS'), { recursive: true });
  await Bun.write(resolve(bundle, 'Contents/Info.plist'), `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>io.zubair.SugarMaple.CanvasBenchmark</string><key>CFBundleExecutable</key><string>native-benchmark</string><key>CFBundleName</key><string>Sugar Maple Canvas Benchmark</string><key>CFBundlePackageType</key><string>APPL</string><key>NSHighResolutionCapable</key><true/></dict></plist>`);
  await command(['swiftc', 'src/apple/Sugar Maple/NativeAccessPolicy.swift', 'tools/native-canvas-benchmark.swift', '-o', executable], 'inherit');
  await command(['codesign', '--force', '--sign', '-', bundle], 'inherit');
  for (const total of [1000, 10000] as const) {
    await command([executable, resources, resolve(output, `fixture-${total}.json`),
      resolve(import.meta.dir, 'canvas-benchmark-page.js'), resolve(output, `webkit-${total}.json`), resolve(output, `webkit-${total}.png`)], 'inherit');
  }
}
await Bun.write(resolve(output, 'environment.json'), JSON.stringify(environment, null, 2));
const hashes: Record<string, string> = {};
for (const name of ['canvas-benchmark-fixture.ts', 'canvas-benchmark-page.js', 'canvas-engine-benchmark.ts', 'native-canvas-benchmark.swift'])
  hashes[`tools/${name}`] = new Bun.CryptoHasher('sha256').update(await Bun.file(resolve(import.meta.dir, name)).arrayBuffer()).digest('hex');
for (const name of ['fixture-1000.json', 'fixture-10000.json', 'chrome-1000.json', 'chrome-10000.json', 'webkit-1000.json', 'webkit-10000.json']) {
  if (await Bun.file(resolve(output, name)).exists()) hashes[name] = new Bun.CryptoHasher('sha256').update(await Bun.file(resolve(output, name)).arrayBuffer()).digest('hex');
}
for await (const name of new Bun.Glob('**/*').scan({ cwd: resources, onlyFiles: true }))
  hashes[`production-bundle/${name}`] = new Bun.CryptoHasher('sha256').update(await Bun.file(resolve(resources, name)).arrayBuffer()).digest('hex');
await Bun.write(resolve(output, 'run-state.json'), JSON.stringify({ state: 'passed', environment, sha256: hashes }, null, 2));
console.log('PASS: visible production Chrome/WKWebView mixed-node camera measurements; raw samples and Chrome traces retained. This is not a release performance verdict.');
