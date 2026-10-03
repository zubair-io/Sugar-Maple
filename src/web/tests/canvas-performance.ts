import { editorURL } from './editor-url';
import { chromium } from '@playwright/test';
import { strict as assert } from 'node:assert';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(editorURL());
  await page.waitForFunction(() => window.sugarMaple.ready);
  const results = [];
  for (const target of [1000, 5000]) {
    const sample = await page.evaluate(async (target) => {
      let d = await window.sugarMaple.dispatch('document.get');
      const pageId = d.document.pages[0].id;
      for (let index = d.document.nodes.length; index < target; index += 400) {
        const operations = Array.from({ length: Math.min(400, target - index) }, (_, offset) => {
          const i = index + offset;
          return {
            type: 'node.add',
            node: {
              id: 'perf-' + i,
              pageId,
              kind: i % 5 === 0 ? 'text' : 'rectangle',
              text: 'Item ' + i,
              x: (i % 100) * 100,
              y: Math.floor(i / 100) * 60,
              width: 80,
              height: 40,
            },
          };
        });
        await window.sugarMaple.dispatch('transaction.apply', {
          documentId: d.documentId,
          expectedRevision: d.revision,
          requestId: crypto.randomUUID(),
          operations,
        });
        d = await window.sugarMaple.dispatch('document.get');
      }
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      const before = window.sugarMaple.viewport.stats().frames,
        started = performance.now();
      window.sugarMaple.viewport.flush();
      const stats = window.sugarMaple.viewport.stats();
      return { ...stats, flushMs: performance.now() - started, framesSince: stats.frames - before };
    }, target);
    assert.equal(sample.total, target);
    assert.ok(sample.drawn > 0 && sample.drawn < target / 4, 'Offscreen nodes must be culled');
    assert.ok(sample.flushMs < 250, 'Local render flush exceeded the 250ms regression ceiling');
    assert.equal(await page.locator('.viewport canvas').count(), 1);
    assert.equal(await page.locator('.viewport [data-node-id]').count(), 0);
    results.push({ nodes: target, ...sample });
  }
  await Bun.write(
    'build/evidence/integrated-canvas-performance.json',
    JSON.stringify(
      {
        date: new Date().toISOString(),
        environment:
          'Chrome headless, local development build, 1440×1000 CSS pixels; CPU flush, not end-to-end input latency',
        results,
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS: 1,000/5,000-node documents render on one canvas, cull offscreen nodes and stay below the local 250ms flush regression ceiling',
  );
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
