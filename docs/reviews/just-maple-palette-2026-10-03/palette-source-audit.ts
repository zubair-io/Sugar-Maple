import { chromium } from "../../../src/web/node_modules/@playwright/test";
import { strict as assert } from "node:assert";
import { mkdirSync } from "node:fs";
const ref = "38c2e6793b4602418b669909865d2292d43a842d";
const sourceRepo = process.argv[2];
const editorUrl = process.argv[3];
if (!sourceRepo || !editorUrl)
  throw Error(
    "Usage: bun docs/reviews/just-maple-palette-2026-10-03/palette-source-audit.ts <Just-Maple checkout> <owned compiled editor URL>",
  );
const source = Bun.spawnSync([
  "git",
  "-C",
  sourceRepo,
  "show",
  ref + ":apps/web/src/styles.scss",
]);
assert.equal(source.exitCode, 0);
const css = source.stdout.toString();
const tokens = (text: string) =>
  Object.fromEntries(
    [...text.matchAll(/(--[a-z-]+)\s*:\s*([^;]+);/g)].map((m) => [
      m[1],
      m[2].trim(),
    ]),
  );
const light = tokens(css.match(/@theme\s*\{([\s\S]*?)\n\}/)![1]);
const dark = {
  ...light,
  ...tokens(css.match(/\[data-theme='dark'\]\s*\{([\s\S]*?)\n\}/)![1]),
};
const names = [
  "bg",
  "surface",
  "surface-alt",
  "surface-hover",
  "sidebar",
  "input-bg",
  "text-main",
  "text-muted",
  "border",
  "primary",
  "bg-hover",
  "bg-active",
];
const aliases = {
  "primary-dim": "primary-light",
  "success-bg": "status-success-bg",
  "success-text": "status-success-text",
  "error-bg": "status-error-bg",
  "error-text": "status-error-text",
};
const expectations = Object.fromEntries(
  Object.entries({ light, dark }).map(([mode, map]) => [
    mode,
    Object.fromEntries(
      [...names.map((name) => [name, name]), ...Object.entries(aliases)].map(
        ([local, upstream]) => ["--color-" + local, map["--color-" + upstream]],
      ),
    ),
  ]),
);
mkdirSync("build/palette-audit", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.goto(editorUrl);
  await page.waitForFunction(() => window.sugarMaple?.ready);
  await page
    .getByRole("button", { name: "Add rectangle", exact: true })
    .click();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(
    () =>
      window.sugarMaple.viewport.stats().total === 1 &&
      window.sugarMaple.viewport.stats().drawn === 1,
  );
  await page.evaluate(() => window.sugarMaple.viewport.flush());
  const checkpoint = await page.evaluate(() =>
    window.sugarMaple.dispatch("document.checkpoint"),
  );
  const pixels = await page
    .locator("canvas-surface canvas")
    .evaluate((el: HTMLCanvasElement) => el.toDataURL());
  const results = [];
  for (const mode of ["dark", "light"]) {
    await page
      .getByLabel("Chrome appearance", { exact: true })
      .selectOption(mode);
    await page.waitForFunction(
      (expected) =>
        getComputedStyle(document.querySelector(".sidebar")!)
          .getPropertyValue("--color-bg")
          .trim() === expected,
      expectations[mode]["--color-bg"],
    );
    await page
      .locator('.drawing-toolbar button[aria-pressed="true"]')
      .evaluate(async (el) => {
        await Promise.all(
          el
            .getAnimations()
            .map((animation) => animation.finished.catch(() => {})),
        );
      });
    const actual = await page.evaluate(
      (names: string[]) =>
        Object.fromEntries(
          [".sidebar", ".inspector", ".topbar", ".drawing-toolbar"].map(
            (selector) => {
              const style = getComputedStyle(document.querySelector(selector)!);
              return [
                selector,
                {
                  paint: style.backgroundColor,
                  tokens: Object.fromEntries(
                    names.map((name) => [
                      name,
                      style.getPropertyValue(name).trim(),
                    ]),
                  ),
                },
              ];
            },
          ),
        ),
      Object.keys(expectations[mode]),
    );
    const normalize = (value: string) =>
      value
        .toLowerCase()
        .replace(/\s/g, "")
        .replace(/0\.(\d+)/g, ".$1");
    for (const [selector, region] of Object.entries(actual))
      for (const [role, expected] of Object.entries(expectations[mode]))
        assert.equal(
          normalize(region.tokens[role]),
          normalize(expected as string),
          mode + " " + selector + " " + role,
        );
    assert.deepEqual(
      await page.evaluate(() =>
        window.sugarMaple.dispatch("document.checkpoint"),
      ),
      checkpoint,
    );
    assert.ok(
      (await page
        .locator("canvas-surface canvas")
        .evaluate((el: HTMLCanvasElement) => el.toDataURL())) === pixels,
      mode + ": unchanged authored Canvas pixels",
    );
    await page.screenshot({ path: `build/palette-audit/${mode}.png` });
    results.push({ mode, actual });
  }
  await Bun.write(
    "build/palette-audit/report.json",
    JSON.stringify(
      {
        passed: true,
        sourceRevision: ref,
        sourceSHA256: new Bun.CryptoHasher("sha256")
          .update(source.stdout)
          .digest("hex"),
        regions: 4,
        roles: 17,
        exactCheckpointAndPixels: true,
        results,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: 17 source palette roles across four production chrome regions in both modes; exact checkpoint and Canvas pixels preserved",
  );
} finally {
  await browser.close();
}
