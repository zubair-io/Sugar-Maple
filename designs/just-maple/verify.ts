import {
  chromium,
  expect,
} from "../../src/web/node_modules/@playwright/test/index.mjs";
import { strict as assert } from "node:assert";
import { nodeBox } from "../../src/web/tests/canvas-browser";
const checkpoint = await Bun.file(
  "designs/just-maple/Just Maple.syrup/document.json",
).json();
const { roots } = await Bun.file("designs/just-maple/screens.json").json();
const b = await chromium.launch({ channel: "chrome", headless: true });
const context = await b.newContext({ viewport: { width: 2048, height: 1400 } });
await context.addInitScript(
  (saved) =>
    localStorage.setItem("sugar-maple-recovery", JSON.stringify(saved)),
  checkpoint,
);
const p = await context.newPage();
await p.goto("http://127.0.0.1:4200");
await p.waitForFunction(() => window.sugarMaple?.ready);
await p.addStyleTag({
  content:
    ".node.selected{outline:none!important}.resize-handle{display:none!important}",
});
const results = [];
for (const [key, id] of Object.entries(roots)) {
  await p.evaluate(async (id) => {
    await window.sugarMaple.dispatch("selection.set", { id });
    await window.sugarMaple.dispatch("viewport.fit");
  }, id);

  const bounds = await nodeBox(p, String(id));
  await p.getByRole("button", { name: "▶ Preview", exact: true }).click();
  const art = p.locator(`.preview-stage .screen [data-node-id="${id}"]`);
  await expect(art).toBeVisible();
  const clip = await art
    .locator(".text")
    .evaluateAll((es) =>
      es
        .filter(
          (e) =>
            e.scrollHeight > e.parentElement!.clientHeight + 2 ||
            e.scrollWidth > e.parentElement!.clientWidth + 2,
        )
        .map((e) => e.textContent),
    );
  assert.deepEqual(clip, [], `${key}: clipped labels`);
  await p.getByRole("button", { name: "Close preview", exact: true }).click();
  await p.locator(".viewport canvas").click({ position: { x: 5, y: 5 } });
  await p.screenshot({
    clip: bounds,
    path: `designs/just-maple/previews/${key}-canvas.png`,
  });
  results.push({ screen: key, clipped: clip.length });
}
await p.evaluate(
  (id) => window.sugarMaple.dispatch("selection.set", { id }),
  roots.welcome,
);
await p.getByRole("button", { name: "▶ Preview", exact: true }).click();
for (const [label, target] of [
  ["Get started  →", "about"],
  ["Continue  →", "import"],
  ["Use sample  →", "learned"],
  ["Keep & continue", "connect"],
  ["Continue  →", "providers"],
  ["Continue  →", "review"],
  ["Looks good  →", "home"],
  ["Review", "why"],
  ["My status is wrong", "correct"],
]) {
  await p
    .locator(".preview-stage .screen")
    .getByRole("button", { name: label, exact: true })
    .click();
  await expect(
    p.locator(`.preview-stage .screen [data-node-id="${roots[target]}"]`),
  ).toBeVisible();
}
await p.locator(".preview-stage .screen").getByText("Notes", { exact: true }).click();
await expect(
  p.locator(`.preview-stage .screen [data-node-id="${roots.notes}"]`),
).toBeVisible();
await p
  .locator(".preview-stage .screen")
  .getByRole("button", { name: "Open notebook  →", exact: true })
  .first()
  .click();
await expect(
  p.locator(`.preview-stage .screen [data-node-id="${roots.notebook}"]`),
).toBeVisible();
await p
  .locator(".preview-stage .screen")
  .getByRole("button", { name: "+ New note", exact: true })
  .click();
await expect(
  p.locator(`.preview-stage .screen [data-node-id="${roots.newnote}"]`),
).toBeVisible();
await p
  .locator(".preview-stage .screen")
  .getByRole("button", { name: "Back to notebook", exact: true })
  .click();
await p
  .locator(".preview-stage .screen")
  .getByRole("button", { name: "All notebooks", exact: true })
  .click();
await p.locator(".preview-stage .screen").getByText("Home", { exact: true }).click();
await expect(
  p.locator(`.preview-stage .screen [data-node-id="${roots.home}"]`),
).toBeVisible();
for (const [index, key] of [
  [1, "work"],
  [2, "out"],
] as const) {
  await p.locator(".preview-stage .screen").getByText("Notes", { exact: true }).click();
  await p
    .locator(".preview-stage .screen")
    .getByRole("button", { name: "Open notebook  →", exact: true })
    .nth(index)
    .click();
  await expect(
    p.locator(`.preview-stage .screen [data-node-id="${roots[key + "book"]}"]`),
  ).toBeVisible();
  await p
    .locator(".preview-stage .screen")
    .getByRole("button", { name: "+ New note", exact: true })
    .click();
  await expect(
    p.locator(`.preview-stage .screen [data-node-id="${roots[key + "note"]}"]`),
  ).toBeVisible();
  await p.locator(".preview-stage .screen").getByText("Home", { exact: true }).click();
}
await Bun.write(
  "designs/just-maple/verification.json",
  JSON.stringify(
    {
      date: new Date().toISOString(),
      renderer: "Integrated Just-Maple Whiteboard Canvas2D; clipping checked in native DOM preview",
      screens: results,
      prototype:
        "Welcome → onboarding → Home → evidence → correction → Notes → notebook → new note → notebook shelf → Home",
      passed: true,
    },
    null,
    2,
  ),
);
await b.close();
console.log(
  "PASS: all artboards render without clipped text; onboarding, evidence and notebook round-trip navigation pass.",
);
