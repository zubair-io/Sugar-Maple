import { chromium, expect } from "../../src/web/node_modules/@playwright/test";
import { strict as assert } from "node:assert";
import { resolve } from "node:path";
import { servePreview } from "./serve";
import { libraryFixture } from "../../tools/library-fixture";
import { project, flatten } from "../../src/web/src/app/canvas/scene-layout";
import { projectLibraryScene } from "./scene-contract";
const server = servePreview();
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const store = libraryFixture(),
  output = resolve("build/library-preview/scene-web");
const tx = (operations: any[]) =>
  store.transact({
    documentId: store.document.id,
    expectedRevision: store.revision,
    requestId: crypto.randomUUID(),
    operations,
  });
const projection = () =>
  projectLibraryScene(
    store.document,
    project(store.document, store.document.pages[0].id)[0],
    store.revision,
  );
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1200 },
    }),
    errors: string[] = [],
    remote: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*", (route) =>
    new URL(route.request().url()).origin === server.url.origin
      ? route.continue()
      : (remote.push(route.request().url()), route.abort()),
  );
  await page.goto(server.url.href);
  await page.waitForFunction(() => Boolean((window as any).preview));
  await page
    .getByRole("button", { name: "Run pinned library preview" })
    .click();
  await expect(page.getByRole("status")).toHaveText("Running locally");
  const send = async (reset = false) =>
    await page.evaluate(
      async ({ scene, reset }) =>
        (window as any).preview.renderScene(scene, reset),
      { scene: projection(), reset },
    );
  const checkpoint = store.checkpoint();
  await send();
  const frame = page.frameLocator("#runtime iframe");
  const boxes = await frame
    .locator("[data-node-id]")
    .evaluateAll((elements) => {
      const root = elements
        .find((e) => e.getAttribute("data-node-id") === "root")!
        .getBoundingClientRect();
      return Object.fromEntries(
        elements.map((e) => {
          const r = e.getBoundingClientRect();
          return [
            e.getAttribute("data-node-id"),
            {
              x: r.x - root.x,
              y: r.y - root.y,
              width: r.width,
              height: r.height,
            },
          ];
        }),
      );
    });
  const items = flatten(project(store.document, store.document.pages[0].id));
  let maxDelta = 0;
  for (const item of items)
    for (const key of ["x", "y", "width", "height"] as const) {
      const delta = Math.abs(boxes[item.node.id][key] - item[key]);
      maxDelta = Math.max(maxDelta, delta);
      assert.ok(
        delta < 0.1,
        `${item.node.id}.${key}: ${boxes[item.node.id][key]} vs ${item[key]}`,
      );
    }
  await expect(
    frame.getByRole("textbox", { name: "Email", exact: true }),
  ).toBeVisible();
  await expect(
    frame.getByRole("button", { name: "Save & Continue", exact: true }),
  ).toBeVisible();
  assert.equal(
    await frame.locator("[data-node-id=header]").getAttribute("slot"),
    "header",
  );
  assert.equal(
    await frame.locator("[data-node-id=button]").getAttribute("slot"),
    "footer",
  );
  await frame
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("ephemeral@example.test");
  await page.waitForFunction(() =>
    (window as any).previewEvents.some(
      (e: any) =>
        e.version === 2 &&
        e.kind === "change" &&
        e.nodeId === "input" &&
        e.value === "ephemeral@example.test",
    ),
  );
  assert.deepEqual(
    store.checkpoint(),
    checkpoint,
    "Real input has no authoring mutation path",
  );
  tx([
    {
      type: "library.props",
      id: "button",
      props: { label: "Updated through source" },
    },
  ]);
  await send();
  await expect(
    frame.getByRole("textbox", { name: "Email", exact: true }),
  ).toHaveValue("ephemeral@example.test");
  await expect(
    frame.getByRole("button", { name: "Updated through source", exact: true }),
  ).toBeVisible();
  await expect(
    frame.getByRole("textbox", { name: "Email", exact: true }),
  ).toBeFocused();
  store.undo();
  await send();
  await expect(
    frame.getByRole("textbox", { name: "Email", exact: true }),
  ).toHaveValue("ephemeral@example.test");
  await expect(
    frame.getByRole("button", { name: "Save & Continue", exact: true }),
  ).toBeVisible();
  await send(true);
  await expect(
    frame.getByRole("textbox", { name: "Email", exact: true }),
  ).toHaveValue("consumer@example.test");
  tx([
    { type: "token.set", name: "brand.primary", value: "#145abc" },
    { type: "library.props", id: "button", props: {}, variant: "Primary" },
  ]);
  await send();
  assert.equal(
    await frame.locator("wa-button").evaluate((n: any) => n.variant),
    "brand",
  );
  await expect
    .poll(() =>
      frame
        .locator("wa-button")
        .evaluate(
          (n: any) =>
            getComputedStyle(n.shadowRoot.querySelector("[part~=base]"))
              .backgroundColor,
        ),
    )
    .toBe("rgb(20, 90, 188)");
  const primary = await frame.locator("wa-button").evaluate((n: any) => ({
    fill: getComputedStyle(n.shadowRoot.querySelector("[part~=base]"))
      .backgroundColor,
    token: getComputedStyle(n)
      .getPropertyValue("--wa-color-brand-fill-loud")
      .trim(),
  }));
  assert.equal(primary.token, "#145abc");
  assert.equal(primary.fill, "rgb(20, 90, 188)");
  tx([
    {
      type: "node.update",
      id: "button",
      patch: { fill: "#763cba", color: "#ffff00", radius: 13 },
    },
  ]);
  await send();
  await expect
    .poll(() =>
      frame
        .locator("wa-button")
        .evaluate(
          (n: any) =>
            getComputedStyle(n.shadowRoot.querySelector("[part~=base]"))
              .backgroundColor,
        ),
    )
    .toBe("rgb(118, 60, 186)");
  const override = await frame.locator("wa-button").evaluate((n: any) => {
    const style = getComputedStyle(n.shadowRoot.querySelector("[part~=base]"));
    return {
      fill: style.backgroundColor,
      color: style.color,
      radius: style.borderTopLeftRadius,
    };
  });
  assert.deepEqual(override, {
    fill: "rgb(118, 60, 186)",
    color: "rgb(255, 255, 0)",
    radius: "13px",
  });
  tx([{ type: "library.props", id: "button", props: {}, variant: "Disabled" }]);
  await send();
  await expect(
    frame.getByRole("button", { name: "Save & Continue", exact: true }),
  ).toBeDisabled();
  const beforeError = await frame.locator("[data-node-id=card]").boundingBox();
  const invalid = projection();
  invalid.elements[2].parentId = "absent";
  const error = await page.evaluate(async (scene) => {
    try {
      await (window as any).preview.renderScene(scene);
      return "";
    } catch (e) {
      return String(e);
    }
  }, invalid);
  assert.match(error, /earlier frame parent/);
  assert.deepEqual(
    await frame.locator("[data-node-id=card]").boundingBox(),
    beforeError,
    "Rejected feed leaves current scene unchanged",
  );
  tx([
    {
      type: "library.props",
      id: "button",
      props: { disabled: false },
      variant: "Default",
    },
  ]);
  await send();
  await frame
    .getByRole("button", { name: "Save & Continue", exact: true })
    .click();
  await page.waitForFunction(() =>
    (window as any).previewEvents.some(
      (e: any) =>
        e.version === 2 && e.kind === "action" && e.nodeId === "button",
    ),
  );
  await page.screenshot({ path: output + ".png", fullPage: true });
  const accessibility = await frame.locator("body").ariaSnapshot();
  assert.ok(accessibility.includes("Email"));
  assert.ok(accessibility.includes("Save & Continue"));
  await page.getByRole("button", { name: "Stop preview" }).click();
  await expect(page.locator("#runtime iframe")).toHaveCount(0);
  assert.deepEqual(errors, []);
  assert.deepEqual(remote, []);
  await Bun.write(
    output + "-report.json",
    JSON.stringify(
      {
        passed: true,
        checks: 8,
        sourceRevision: store.revision,
        maxAuthoredGeometryDelta: maxDelta,
        primary,
        override,
        accessibility,
        assertions: [
          "Real package hosts match all five authored boxes",
          "Actual named Card slots and accessible controls",
          "Node-specific typed events without authoring mutation",
          "Ephemeral input survives source update/undo; explicit reset restores authored value",
          "Primary uses pinned brand appearance and resolved token",
          "Local fill/color/radius reach actual shadow base",
          "Disabled and invalid-feed guards",
          "Stop and offline boundary",
        ],
        limitations: [
          "Native scene renderer is not exercised here",
          "No physical paint/input latency or full VoiceOver measurement",
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: authored geometry and actual package slots/variants/token/overrides, accessible typed events, ephemeral update/undo/reset, disabled/rejection/stop and offline scene rendering",
  );
} finally {
  try {
    await browser?.close();
  } finally {
    server.stop(true);
  }
}
