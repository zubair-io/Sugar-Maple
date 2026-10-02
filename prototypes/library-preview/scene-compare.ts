import {
  chromium,
  expect,
  type Browser,
  type Page,
} from "../../src/web/node_modules/@playwright/test";
import { strict as assert } from "node:assert";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  libraryFixture,
  webAwesomeManifest,
} from "../../tools/library-fixture";
import type { Item, Box } from "../../src/web/src/app/canvas/scene-layout";
import {
  projectLibraryScene,
  nativeSceneDiagnostics,
  type LibraryScene,
} from "./scene-contract";
import { servePreview } from "./serve";
import { buildNativeFixture } from "./native/build";
import { NativePreview } from "./native/controller";
import { canvasPaint, nativePaint } from "./scene-paint-read";

if (!process.argv.includes("--trust-native-fixture"))
  throw Error("Explicit native fixture opt-in required");
const editorURL = new URL(process.env.MAPLE_COMPARISON_EDITOR_URL ?? "");
if (
  editorURL.hostname !== "127.0.0.1" ||
  editorURL.protocol !== "http:" ||
  editorURL.username ||
  editorURL.password ||
  editorURL.pathname !== "/" ||
  editorURL.search ||
  editorURL.hash
)
  throw Error("An owned plain loopback editor origin is required");
const folder = resolve("build/library-scene-comparison");
await mkdir(folder, { recursive: true });
const server = servePreview(),
  errors: string[] = [],
  remote: string[] = [],
  records: any[] = [];
let browser: Browser | undefined, native: NativePreview | undefined;
const tolerance = 0.1;
function delta(
  actual: Record<string, Box>,
  expected: Record<string, Box>,
  label: string,
) {
  assert.deepEqual(
    Object.keys(actual).sort(),
    Object.keys(expected).sort(),
    label + " node identities",
  );
  let max = 0;
  for (const [id, box] of Object.entries(expected))
    for (const key of ["x", "y", "width", "height"] as const) {
      const difference = Math.abs(actual[id][key] - box[key]);
      max = Math.max(max, difference);
      assert.ok(
        difference <= tolerance,
        `${label} ${id}.${key}: ${actual[id][key]} vs ${box[key]}, tolerance=${tolerance}`,
      );
    }
  return max;
}
function metrics(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    samples,
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
  };
}
async function transaction(page: Page, operations: any[]) {
  return page.evaluate(async (operations) => {
    const d = await window.sugarMaple.dispatch("document.get");
    return window.sugarMaple.dispatch("transaction.apply", {
      documentId: d.documentId,
      expectedRevision: d.revision,
      requestId: crypto.randomUUID(),
      operations,
    });
  }, operations);
}
async function undo(page: Page) {
  return page.evaluate(async () => {
    const d = await window.sugarMaple.dispatch("document.get");
    return window.sugarMaple.dispatch("history.undo", {
      documentId: d.documentId,
      expectedRevision: d.revision,
    });
  });
}
async function checkpoint(page: Page) {
  return page.evaluate(() => window.sugarMaple.dispatch("document.checkpoint"));
}
/** Read the settled Canvas model, including actual font measurement and responsive
 * geometry, through Angular's development-only read interface. No DOM semantics
 * are reconstructed and no production/MCP capabilities are added for the test. */
async function captureSource(page: Page) {
  const read = await page.evaluate(async () => {
    const layout = await window.sugarMaple.dispatch("layout.inspect"),
      d = await window.sugarMaple.dispatch("document.get");
    if (window.sugarMaple.viewport.hasDraft())
      throw Error("Source has an uncommitted draft");
    const surface = (window as any).ng.getComponent(
      document.querySelector("canvas-surface"),
    );
    if (!surface?.p?.roots)
      throw Error("Development-only Canvas model reader unavailable");
    const items: any[] = [];
    const walk = (item: any) => {
      items.push({
        node: item.node,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        bounds: item.bounds,
        transform: item.transform,
        depth: item.depth,
        ancestors: item.ancestors.map((a: any) => a.node.id),
      });
      item.children.forEach(walk);
    };
    surface.p.roots().forEach(walk);
    return { layout, d, items, stats: window.sugarMaple.viewport.stats() };
  });
  assert.equal(read.layout.documentId, read.d.documentId);
  assert.equal(read.layout.revision, read.d.revision);
  const items = new Map<string, Item>();
  for (const value of read.items) {
    const item: Item = {
      ...value,
      children: [],
      ancestors: value.ancestors.map((id: string) => items.get(id)!),
    };
    items.set(item.node.id, item);
    item.ancestors.at(-1)?.children.push(item);
  }
  const root = items.get("root")!;
  const scene = projectLibraryScene(read.d.document, root, read.d.revision);
  const expected = Object.fromEntries(
    [...items.values()].map((item) => [
      item.node.id,
      { ...item.bounds, x: item.bounds.x - root.x, y: item.bounds.y - root.y },
    ]),
  );
  const screenRoot = read.layout.nodes.find((n: any) => n.id === "root").bounds;
  const scale = screenRoot.width / root.width;
  const canvas = Object.fromEntries(
    read.layout.nodes.map((n: any) => {
      assert.ok(
        n.rendered && n.painted && n.bounds,
        "Actual Canvas paints " + n.id,
      );
      return [
        n.id,
        {
          x: (n.bounds.x - screenRoot.x) / scale,
          y: (n.bounds.y - screenRoot.y) / scale,
          width: n.bounds.width / scale,
          height: n.bounds.height / scale,
        },
      ];
    }),
  );
  const max = delta(canvas, expected, "Actual Canvas inspector");
  assert.ok(read.stats.frames > 0 && read.stats.drawn >= scene.elements.length);
  assert.equal(
    await page
      .locator(".viewport input,.viewport button:not(.resize-handle)")
      .count(),
    0,
    "Authored design remains Canvas paint",
  );
  return { ...read, scene, expected, canvas, max, screenRoot };
}
async function domBoxes(page: Page, selector: string) {
  return page.locator(selector).evaluateAll((elements) => {
    const root = elements
      .find((el) => el.getAttribute("data-node-id") === "root")!
      .getBoundingClientRect();
    return Object.fromEntries(
      elements.map((el) => {
        const box = el.getBoundingClientRect();
        return [
          el.getAttribute("data-node-id"),
          {
            x: box.x - root.x,
            y: box.y - root.y,
            width: box.width,
            height: box.height,
          },
        ];
      }),
    );
  });
}
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1200 },
    deviceScaleFactor: 1,
  });
  console.log("Comparison native phase: building trusted fixture");
  const buildStart = performance.now(),
    build = await buildNativeFixture(true),
    buildMilliseconds = performance.now() - buildStart;
  console.log("Comparison native phase: trusted build completed");
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.origin === editorURL.origin || url.origin === server.url.origin
      ? route.continue()
      : (remote.push(url.href), route.abort());
  });
  const editor = await context.newPage(),
    dom = await context.newPage(),
    web = await context.newPage();
  for (const page of [editor, dom, web])
    page.on("pageerror", (error) => errors.push(error.message));
  await editor.goto(editorURL.href);
  await editor.waitForFunction(() => window.sugarMaple.ready);
  const fixture = libraryFixture();
  await editor.evaluate(
    async ({ nodes, manifest }) => {
      const d = await window.sugarMaple.dispatch("document.get");
      await window.sugarMaple.dispatch("transaction.apply", {
        documentId: d.documentId,
        expectedRevision: d.revision,
        requestId: crypto.randomUUID(),
        operations: [
          { type: "library.import", manifest },
          ...nodes.map((node) => ({
            type: "node.add",
            node: { ...node, pageId: d.document.pages[0].id },
          })),
        ],
      });
      await window.sugarMaple.dispatch("selection.set", { id: "button" });
      await window.sugarMaple.dispatch("viewport.fit");
    },
    { nodes: fixture.document.nodes, manifest: webAwesomeManifest },
  );
  await dom.goto(new URL("#preview", editorURL).href);
  await dom.waitForFunction(() => window.sugarMaplePreview?.ready);
  assert.equal(await dom.evaluate(() => typeof window.sugarMaple), "undefined");
  await web.goto(server.url.href);
  await web.waitForFunction(() => Boolean((window as any).preview));
  await web.getByRole("button", { name: "Run pinned library preview" }).click();
  await expect(web.getByRole("status")).toHaveText("Running locally");
  const child = web.frameLocator("#runtime iframe");
  const runtimeStart = performance.now();
  native = new NativePreview(build, () => {});
  await native.ready;
  console.log("Comparison native phase: sandboxed helper ready");
  const coldSpawnMilliseconds = performance.now() - runtimeStart;
  let lastSource: Awaited<ReturnType<typeof captureSource>>;
  const feedWeb = (scene: LibraryScene, reset: boolean) =>
    web.evaluate(
      async ({ scene, reset }) =>
        (window as any).preview.renderScene(scene, reset),
      { scene, reset },
    );
  const feedDOM = (source: Awaited<ReturnType<typeof captureSource>>) =>
    dom.evaluate(
      async (snapshot) => window.sugarMaplePreview!.receive(snapshot),
      {
        version: 1,
        documentId: source.d.documentId,
        revision: source.d.revision,
        rootId: "root",
        document: source.d.document,
      },
    );
  async function compare(name: string, reset = false) {
    const source = await captureSource(editor),
      before = await checkpoint(editor);
    await feedDOM(source);
    await feedWeb(source.scene, reset);
    if (name === "primary") {
      // End the earlier Button's focus/hover interaction using real input.
      // Package focus paint is intentional and is not the resting brand token.
      await child.getByRole("textbox", { name: "Email", exact: true }).click();
      await web.mouse.move(0, 0);
      await expect
        .poll(() =>
          child
            .locator("wa-button")
            .evaluate(
              (n: any) =>
                getComputedStyle(n.shadowRoot.querySelector("[part~=base]"))
                  .backgroundColor,
            ),
        )
        .toBe("rgb(20, 90, 188)");
    }
    await expect(dom.locator("[data-node-id=button] > button")).toHaveText(
      source.d.document.nodes.find((n: any) => n.id === "button").text,
    );
    const semantic = await domBoxes(dom, ".preview-stage [data-node-id]");
    const actualWeb = await child
      .locator("[data-node-id]")
      .evaluateAll((elements) => {
        const root = elements
          .find((el) => el.getAttribute("data-node-id") === "root")!
          .getBoundingClientRect();
        return Object.fromEntries(
          elements.map((el) => {
            const b = el.getBoundingClientRect();
            return [
              el.getAttribute("data-node-id"),
              {
                x: b.x - root.x,
                y: b.y - root.y,
                width: b.width,
                height: b.height,
              },
            ];
          }),
        );
      });
    const diagnostics = nativeSceneDiagnostics(source.scene);
    if (name === "authored-border")
      await Bun.write(
        resolve(folder, "authored-border-observations.json"),
        JSON.stringify(
          {
            sourceRevision: source.d.revision,
            sourceDocument: source.d.document,
            expected: source.expected,
            dom: semantic,
            web: actualWeb,
          },
          null,
          2,
        ),
      );
    const record: any = {
      name,
      documentId: source.d.documentId,
      sourceRevision: source.d.revision,
      scene: source.scene,
      expected: source.expected,
      canvas: source.canvas,
      dom: semantic,
      web: actualWeb,
      maxDelta: {
        canvas: source.max,
        dom: delta(semantic, source.expected, name + " semantic DOM"),
        web: delta(actualWeb, source.expected, name + " actual package"),
      },
      nativeDiagnostics: diagnostics,
    };
    if (diagnostics.length) {
      assert.throws(
        () => native!.renderScene(source.scene, reset),
        /unsupported/,
      );
      record.native = {
        supported: false,
        message: diagnostics.join("\n"),
        currentSupportedScenePreserved: true,
      };
    } else {
      const renderStart = performance.now(),
        rendered = await native!.renderScene(source.scene, reset);
      assert.ok(rendered.version === 2 && rendered.kind === "rendered");
      record.native = {
        supported: true,
        renderMilliseconds: performance.now() - renderStart,
        boxes: rendered.boxes,
        revision: rendered.revision,
        pixelWidth: rendered.width,
        pixelHeight: rendered.height,
      };
      record.maxDelta.native = delta(
        rendered.boxes,
        source.expected,
        name + " actual SwiftUI",
      );
      await Bun.write(
        resolve(folder, name + "-native.png"),
        Buffer.from(rendered.png, "base64"),
      );
      if (name === "nested-overrides") {
        record.native.paint = await nativePaint(
          editor,
          rendered.png,
          rendered.boxes.button,
          source.scene.width,
        );
        assert.ok(
          record.native.paint.purple > 100 && record.native.paint.yellow > 0,
          "Actual native Button displays authored fill and text paint",
        );
      }
    }
    await expect(child.locator("[data-node-id=header]")).toHaveAttribute(
      "slot",
      "header",
    );
    await expect(child.locator("[data-node-id=button]")).toHaveAttribute(
      "slot",
      "footer",
    );
    assert.deepEqual(
      await checkpoint(editor),
      before,
      "Consumers never mutate source/checkpoint",
    );
    if (name === "nested-overrides") {
      record.canvasPaint = await canvasPaint(
        editor,
        source.layout.nodes.find((n: any) => n.id === "button").bounds,
      );
      assert.ok(
        record.canvasPaint.purple > 100 && record.canvasPaint.yellow > 0,
        "Actual Canvas Button displays bound fill and local text paint",
      );
    }
    record.accessibility = {
      canvas: await editor.locator(".viewport").ariaSnapshot(),
      dom: await dom.locator(".preview-stage").ariaSnapshot(),
      web: await child.locator("body").ariaSnapshot(),
    };
    await editor.screenshot({
      path: resolve(folder, name + "-canvas.png"),
      clip: source.screenRoot,
    });
    await dom
      .locator(".preview-stage")
      .screenshot({ path: resolve(folder, name + "-dom.png") });
    await child
      .locator("[data-node-id=root]")
      .screenshot({ path: resolve(folder, name + "-web.png") });
    records.push(record);
    lastSource = source;
    console.log(
      `PASS: ${name}: actual Canvas, DOM, package${diagnostics.length ? "; actionable native limitation" : ", SwiftUI"} geometry, source identity and unchanged checkpoint`,
    );
    return source;
  }
  const initial = await compare("default");
  const initialDocument = initial.d.document;
  await expect(
    dom.getByRole("textbox", { name: "Email", exact: true }),
  ).toHaveValue("consumer@example.test");
  await expect(
    child.getByRole("textbox", { name: "Email", exact: true }),
  ).toHaveValue("consumer@example.test");
  await dom
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("dom@example.test");
  await child
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("web@example.test");
  await web.waitForFunction(() =>
    (window as any).previewEvents.some(
      (e: any) =>
        e.version === 2 &&
        e.kind === "change" &&
        e.nodeId === "input" &&
        e.value === "web@example.test",
    ),
  );
  assert.deepEqual((await checkpoint(editor)).document, initialDocument);
  const beforeEdit = await checkpoint(editor);
  await editor
    .getByLabel("Library prop label", { exact: true })
    .fill("Edited in actual inspector");
  await editor.getByLabel("Library prop label", { exact: true }).press("Tab");
  await editor.waitForFunction(
    async () =>
      (await window.sugarMaple.dispatch("document.get")).document.nodes.find(
        (n) => n.id === "button",
      )?.text === "Edited in actual inspector",
  );
  assert.equal(
    (await checkpoint(editor)).journal.length,
    beforeEdit.journal.length + 1,
  );
  await compare("source-update");
  await expect(
    dom.getByRole("textbox", { name: "Email", exact: true }),
  ).toHaveValue("dom@example.test");
  await expect(
    child.getByRole("textbox", { name: "Email", exact: true }),
  ).toHaveValue("web@example.test");
  await expect(
    child.getByRole("textbox", { name: "Email", exact: true }),
  ).toBeFocused();
  await undo(editor);
  assert.deepEqual((await checkpoint(editor)).document, initialDocument);
  await compare("source-undo");
  await expect(
    dom.getByRole("textbox", { name: "Email", exact: true }),
  ).toHaveValue("dom@example.test");
  await expect(
    child.getByRole("textbox", { name: "Email", exact: true }),
  ).toHaveValue("web@example.test");
  await expect(
    child.getByRole("textbox", { name: "Email", exact: true }),
  ).toBeFocused();
  await dom.getByRole("button", { name: "Reset preview", exact: true }).click();
  await feedWeb(lastSource!.scene, true);
  await native.renderScene(lastSource!.scene, true);
  await expect(
    dom.getByRole("textbox", { name: "Email", exact: true }),
  ).toHaveValue("consumer@example.test");
  await expect(
    child.getByRole("textbox", { name: "Email", exact: true }),
  ).toHaveValue("consumer@example.test");
  await child
    .getByRole("button", { name: "Save & Continue", exact: true })
    .click();
  await web.waitForFunction(() =>
    (window as any).previewEvents.some(
      (e: any) =>
        e.version === 2 && e.kind === "action" && e.nodeId === "button",
    ),
  );
  assert.deepEqual((await checkpoint(editor)).document, initialDocument);
  // The preceding physical package click leaves the pointer over the Button.
  // Compare resting authored appearance, rather than its intentional hover shade.
  await web.mouse.move(0, 0);
  await transaction(editor, [
    { type: "token.set", name: "brand.primary", value: "#145abc" },
  ]);
  await editor
    .getByLabel("Library variant", { exact: true })
    .selectOption("Primary");
  await editor.waitForFunction(
    async () =>
      (await window.sugarMaple.dispatch("document.get")).document.nodes.find(
        (n) => n.id === "button",
      )?.libraryRef?.variant === "Primary",
  );
  const primary = await compare("primary");
  const originalButton = initialDocument.nodes.find(
      (n: any) => n.id === "button",
    ),
    primaryButton = primary.d.document.nodes.find(
      (n: any) => n.id === "button",
    );
  for (const field of ["fill", "color", "stroke", "radius"])
    assert.equal(
      primaryButton[field],
      originalButton[field],
      "Source variant does not imply semantic package paint",
    );
  await expect(
    editor.getByRole("status", { name: "Native library preview support" }),
  ).toContainText("variant Primary is unsupported");
  await expect
    .poll(() =>
      child
        .locator("wa-button")
        .evaluate(
          (n: any) =>
            getComputedStyle(n.shadowRoot.querySelector("[part~=base]"))
              .backgroundColor,
        ),
    )
    .toBe("rgb(20, 90, 188)");
  records.at(-1).packagePaint = {
    fill: "rgb(20, 90, 188)",
    variant: await child.locator("wa-button").evaluate((n: any) => n.variant),
  };
  await transaction(editor, [
    { type: "library.reset", id: "button" },
    { type: "library.props", id: "button", props: {}, variant: "Disabled" },
    { type: "library.props", id: "input", props: {}, variant: "Disabled" },
  ]);
  const disabled = await compare("disabled"),
    disabledLabel = disabled.d.document.nodes.find(
      (n: any) => n.id === "button",
    ).text;
  for (const control of [
    dom.getByRole("textbox", { name: "Email", exact: true }),
    child.getByRole("textbox", { name: "Email", exact: true }),
    dom.getByRole("button", { name: disabledLabel, exact: true }),
    child.getByRole("button", { name: disabledLabel, exact: true }),
  ])
    await expect(control).toBeDisabled();
  const pageId = primary.d.document.pages[0].id,
    key = primaryButton.libraryRef.key;
  await transaction(editor, [
    {
      type: "library.props",
      id: "button",
      props: { disabled: false },
      variant: "Default",
    },
    {
      type: "library.props",
      id: "input",
      props: { disabled: false },
      variant: "Default",
    },
    {
      type: "node.update",
      id: "input",
      patch: { widthMode: "fill", heightMode: "percent", heightPercent: 10 },
    },
    { type: "token.set", name: "local.paint", value: "#763cba" },
    {
      type: "node.update",
      id: "button",
      patch: { fillToken: "local.paint", color: "#ffff00", radius: 13 },
    },
    {
      type: "library.insert",
      key,
      component: "Card",
      id: "nested",
      pageId,
      x: 0,
      y: 0,
      props: { padding: 5 },
    },
    {
      type: "node.update",
      id: "nested",
      patch: {
        parentId: "card",
        width: 179.61,
        height: 119.23,
        fill: "#145abc",
        radius: 9,
      },
    },
    {
      type: "node.add",
      node: {
        id: "nested-header",
        parentId: "nested",
        pageId,
        kind: "text",
        width: 120,
        height: 20,
        text: "Nested header",
        librarySlot: "header",
      },
    },
    {
      type: "node.update",
      id: "card",
      patch: { x: 20.23, y: 20.17, width: 359.31, height: 459.73 },
    },
  ]);
  await compare("nested-overrides");
  await expect(child.locator("[data-node-id=nested-header]")).toHaveAttribute(
    "slot",
    "header",
  );
  await expect
    .poll(() =>
      child
        .locator("wa-button")
        .evaluate(
          (n: any) =>
            getComputedStyle(n.shadowRoot.querySelector("[part~=base]"))
              .backgroundColor,
        ),
    )
    .toBe("rgb(118, 60, 186)");
  const override = await child.locator("wa-button").evaluate((n: any) => {
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
  records.at(-1).packagePaint = override;
  await transaction(editor, [
    { type: "node.update", id: "nested", patch: { rotation: 13 } },
    { type: "node.update", id: "button", patch: { rotation: 27 } },
  ]);
  await compare("nested-rotations");
  await undo(editor);
  await transaction(editor, [
    {
      type: "node.update",
      id: "card",
      patch: { strokeWidth: 2.5, stroke: "#763cba" },
    },
  ]);
  await compare("authored-border");
  await undo(editor);
  await undo(editor);
  await undo(editor);
  await undo(editor); // Restore source geometry/props; the independently authored brand token remains.
  await compare("restored");
  const samples: Record<string, number[]> = {
    canvas: [],
    dom: [],
    web: [],
    native: [],
  };
  for (let i = 0; i < 30; i++) {
    const start = performance.now();
    await transaction(editor, [
      {
        type: "library.props",
        id: "button",
        props: { label: `Measured ${i}` },
      },
    ]);
    const source = await captureSource(editor);
    samples.canvas.push(performance.now() - start);
    let at = performance.now();
    await feedDOM(source);
    await dom
      .locator("[data-node-id=button] > button")
      .filter({ hasText: `Measured ${i}` })
      .waitFor();
    samples.dom.push(performance.now() - at);
    at = performance.now();
    await feedWeb(source.scene, false);
    samples.web.push(performance.now() - at);
    at = performance.now();
    await native.renderScene(source.scene);
    samples.native.push(performance.now() - at);
  }
  const fileCosts = [];
  for (const name of new Bun.Glob("**/*").scanSync({
    cwd: build.bundle,
    onlyFiles: true,
  }))
    fileCosts.push({
      name,
      bytes: (await Bun.file(resolve(build.bundle, name)).arrayBuffer())
        .byteLength,
    });
  const pipelineTimings = Object.fromEntries(
    Object.entries(samples).map(([name, values]) => [name, metrics(values)]),
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(remote, []);
  await web.getByRole("button", { name: "Stop preview" }).click();
  await expect(web.locator("#runtime iframe")).toHaveCount(0);
  await dom.evaluate(() => window.sugarMaplePreview!.dispose());
  await Bun.write(
    resolve(folder, "comparison.json"),
    JSON.stringify(
      {
        passed: true,
        recordedAt: new Date().toISOString(),
        editorOrigin: editorURL.origin,
        records,
        toleranceLogicalPoints: tolerance,
        pipelineTimings,
        timingDefinitions: {
          canvas:
            "Real editor transaction, layout settlement, read-only Canvas projection and geometry assertions, including browser IPC",
          dom: "Same source feed plus observed label update; IPC/Angular scheduling included",
          web: "Same scene MessageChannel + Lit update + two RAF opportunities",
          native:
            "Same scene IPC + intentional 50ms snapshot scheduling + PNG encode/reply",
        },
        costs: {
          web: await Bun.file("build/library-preview/build.json").json(),
          native: {
            buildMilliseconds,
            coldSpawnMilliseconds,
            fileCosts,
            bundleBytes: fileCosts.reduce((sum, file) => sum + file.bytes, 0),
            launcherBytes: (await Bun.file(build.limit).arrayBuffer())
              .byteLength,
            stats: native.owner.stats(),
          },
        },
        checks: [
          "Actual editor settled Canvas model is the source for every feed",
          "Canonical inspector source edit and exact undo",
          "Every visible outer box across actual Canvas/DOM/package/SwiftUI at unchanged 0.1 tolerance",
          "Default/Primary/Disabled with actionable unsupported native Primary",
          "Named nested slots, resolved fill/percent/fractional geometry and nested rotations",
          "Bound token and local fill/color/radius reach actual package paint",
          "Semantic/package appearance boundary visible in production inspector",
          "Source checkpoint unaffected by consumers",
          "Semantic/web ephemeral input through source update/undo/reset; focused web input retained",
          "Typed node action/change, absent preview authoring bridge, offline requests and stop",
        ],
        limitations: [
          "Outer presentation geometry does not prove pixel-identical intrinsic chrome/glyphs",
          "Native physical keyboard/accessibility evidence is separate, source-bound to bbed36b",
          "These different timing boundaries cannot rank physical input latency/FPS",
          "Native helper includes a fixed 50ms scheduling wait",
          "No whole-product VoiceOver, hostile arbitrary source or distribution/memory parity claim",
        ],
        productionDecision:
          "NO-GO for arbitrary-source or production integration until final review/CI, current-base integration and resulting-main validation; continue explicitly trusted supported experiments",
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: actual editor authored-scene comparison across Canvas, semantic DOM, pinned package and sandboxed SwiftUI; source edit/undo/input boundaries and measured observations recorded",
  );
} finally {
  try {
    native?.stop();
    await native?.owner.done.catch(() => {});
  } finally {
    try {
      await browser?.close();
    } finally {
      server.stop(true);
    }
  }
}
