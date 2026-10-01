import { chromium } from "../../src/web/node_modules/@playwright/test/index.mjs";
import { resolve } from "node:path";
const { roots } = await Bun.file("designs/just-maple/screens.json").json();
const b = await chromium.launch({ channel: "chrome", headless: true });
const page = await b.newPage({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
});
const checks = [];
for (const key of Object.keys(roots)) {
  await page.goto(
    "file://" + resolve(`designs/just-maple/previews/${key}.html`),
  );
  await page.screenshot({ path: `designs/just-maple/previews/${key}.png` });
  const clipped = await page.evaluate(() =>
    Array.from(document.querySelectorAll("*"))
      .filter(
        (e) =>
          e.textContent?.trim() &&
          e.children.length === 0 &&
          ((e as HTMLElement).scrollWidth >
            (e as HTMLElement).clientWidth + 2 ||
            (e as HTMLElement).scrollHeight >
              (e as HTMLElement).clientHeight + 2),
      )
      .map((e) => ({
        text: e.textContent,
        width: (e as HTMLElement).clientWidth,
        scroll: (e as HTMLElement).scrollWidth,
      })),
  );
  checks.push({ screen: key, clipped });
}
await b.close();
console.log(JSON.stringify(checks, null, 2));
