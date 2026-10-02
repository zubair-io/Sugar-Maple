import { chromium, expect } from "../../src/web/node_modules/@playwright/test";
import { strict as assert } from "node:assert";
import { resolve } from "node:path";
import { serveSceneReport } from "./serve-scene-report";
const folder = resolve("build/library-scene-comparison"),
  server = await serveSceneReport(folder);
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1100 },
    }),
    errors: string[] = [],
    remote: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) =>
    new URL(route.request().url()).origin === server.url.origin
      ? route.continue()
      : (remote.push(route.request().url()), route.abort()),
  );
  await page.goto(server.url.href);
  const comparison = await Bun.file(resolve(folder, "comparison.json")).json();
  await expect(page.locator("[data-phase]")).toHaveCount(
    comparison.records.length,
  );
  assert.equal(
    await page
      .locator("img")
      .evaluateAll((images) =>
        images.every(
          (image) =>
            (image as HTMLImageElement).complete &&
            (image as HTMLImageElement).naturalWidth > 0,
        ),
      ),
    true,
  );
  await page.getByLabel("Compare source state").selectOption("primary");
  await expect(page.locator("[data-phase=primary]")).toBeVisible();
  await expect(page.locator("[data-phase=default]")).toBeHidden();
  await expect(page.locator("[data-phase=primary] .unsupported")).toContainText(
    "variant Primary is unsupported",
  );
  await expect(page.locator("[data-phase=primary] img")).toHaveCount(3);
  assert.equal(
    (await fetch(new URL("/primary-native.png", server.url))).status,
    404,
    "No substituted unsupported native capture is served",
  );
  assert.equal(
    (await fetch(new URL("/comparison.json?path=private", server.url))).status,
    404,
  );
  await page
    .getByLabel("Compare source state")
    .selectOption("nested-overrides");
  await expect(page.locator("[data-phase=nested-overrides] img")).toHaveCount(
    4,
  );
  await page.screenshot({
    path: resolve(folder, "report.png"),
    fullPage: true,
  });
  await page.getByLabel("Compare source state").selectOption("all");
  await expect(page.locator("[data-phase=default]")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    true,
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(remote, []);
  console.log(
    "PASS: real scene comparison report states, captured images, unsupported native boundary, filtering, narrow serving and responsive layout",
  );
} finally {
  try {
    await browser?.close();
  } finally {
    server.stop(true);
  }
}
