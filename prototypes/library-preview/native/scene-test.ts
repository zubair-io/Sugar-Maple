import { strict as assert } from "node:assert";
import { buildNativeFixture } from "./build";
import { NativePreview, type NativeReply } from "./controller";
import { libraryFixture } from "../../../tools/library-fixture";
import { project, flatten } from "../../../src/web/src/app/canvas/scene-layout";
import { projectLibraryScene } from "../scene-contract";
import { libraryKey } from "../../../src/web/src/app/model/library-schema";
import { webAwesomeManifest } from "../../../src/web/src/app/model/bundled-library";

if (!process.argv.includes("--trust-native-fixture"))
  throw Error("Explicit --trust-native-fixture required");
const build = await buildNativeFixture(true),
  events: NativeReply[] = [],
  raw: any[] = [];
const native = new NativePreview(build, (event) => events.push(event));
let buffer = "";
native.owner.child.stdout!.on("data", (chunk) => {
  buffer += chunk.toString();
  let index: number;
  while ((index = buffer.indexOf("\n")) >= 0) {
    raw.push(JSON.parse(buffer.slice(0, index)));
    buffer = buffer.slice(index + 1);
  }
});
const store = libraryFixture(),
  initial = store.checkpoint();
const scene = () =>
  projectLibraryScene(
    store.document,
    project(store.document, store.document.pages[0].id)[0],
    store.revision,
  );
const tx = (operations: any[]) =>
  store.transact({
    documentId: store.document.id,
    expectedRevision: store.revision,
    requestId: crypto.randomUUID(),
    operations,
  });
const records: any[] = [];
async function render(name: string, reset = false) {
  const checkpoint = store.checkpoint(),
    reply = await native.renderScene(scene(), reset);
  assert.equal(reply.kind, "rendered");
  assert.ok(reply.version === 2 && reply.kind === "rendered");
  const items = flatten(project(store.document, store.document.pages[0].id));
  const root = items[0];
  let maxDelta = 0;
  for (const item of items) {
    const box = reply.boxes[item.node.id];
    assert.ok(box, "Actual SwiftUI geometry must include " + item.node.id);
    const expected = {
      x: item.bounds.x - root.x,
      y: item.bounds.y - root.y,
      width: item.bounds.width,
      height: item.bounds.height,
    };
    for (const key of ["x", "y", "width", "height"] as const) {
      const delta = Math.abs(box[key] - expected[key]);
      maxDelta = Math.max(delta, maxDelta);
      assert.ok(
        delta <= 0.1,
        `${name} ${item.node.id}.${key}: native=${box[key]}, authored=${expected[key]}, tolerance=0.1 CSS/logical point`,
      );
    }
  }
  assert.equal(
    Buffer.from(reply.png, "base64").subarray(0, 8).toString("hex"),
    "89504e470d0a1a0a",
  );
  assert.deepEqual(
    store.checkpoint(),
    checkpoint,
    "Consumer must not mutate the authoritative store",
  );
  await Bun.write(
    `build/library-preview-native/scene-${name}.png`,
    Buffer.from(reply.png, "base64"),
  );
  records.push({
    name,
    ...reply,
    png: undefined,
    pngSHA256: new Bun.CryptoHasher("sha256")
      .update(Buffer.from(reply.png, "base64"))
      .digest("hex"),
    maxDelta,
  });
  return reply;
}
try {
  await native.ready;
  const first = await render("default");
  tx([
    {
      type: "node.update",
      id: "button",
      patch: {
        text: "Authored native label",
        fill: "#763cba",
        color: "#ffff00",
        radius: 13,
      },
    },
    {
      type: "node.update",
      id: "input",
      patch: { widthMode: "fill", heightMode: "percent", heightPercent: 10 },
    },
    {
      type: "library.insert",
      key: libraryKey(webAwesomeManifest),
      component: "Card",
      id: "nested",
      pageId: store.document.pages[0].id,
      x: 0,
      y: 0,
      props: { padding: 5 },
    },
    {
      type: "node.update",
      id: "nested",
      patch: {
        parentId: "card",
        width: 180,
        height: 120,
        fill: "#145abc",
        radius: 9,
      },
    },
    {
      type: "node.add",
      node: {
        id: "nested-header",
        parentId: "nested",
        pageId: store.document.pages[0].id,
        kind: "text",
        width: 120,
        height: 20,
        text: "Nested header",
        librarySlot: "header",
      },
    },
  ]);
  await render("nested-overrides");
  tx([
    {
      type: "node.update",
      id: "card",
      patch: { x: 20.23, y: 20.17, width: 359.31, height: 459.73 },
    },
    {
      type: "node.update",
      id: "nested",
      patch: { width: 179.61, height: 119.23 },
    },
  ]);
  await render("fractional-parents");
  tx([
    { type: "node.update", id: "nested", patch: { rotation: 13 } },
    { type: "node.update", id: "button", patch: { rotation: 27 } },
  ]);
  await render("nested-rotations");
  store.undo();
  store.undo();
  store.undo();
  assert.deepEqual(store.document, initial.document);
  await render("undo");
  tx([
    { type: "library.props", id: "button", props: {}, variant: "Disabled" },
    { type: "library.props", id: "input", props: {}, variant: "Disabled" },
  ]);
  await render("disabled");
  store.undo();
  await render("reset", true);
  const current = scene(),
    revision = records.at(-1).revision;
  const packet = {
    version: 2,
    session: native.session,
    revision: revision + 1,
    kind: "render-scene",
    scene: current,
    reset: false,
  };
  const mutate = (id: string, change: (node: any) => any) => ({
    ...current,
    elements: current.elements.map((n) =>
      n.id === id ? change(structuredClone(n)) : n,
    ),
  });
  const invalid = [
    { ...packet, method: "transaction.apply" },
    { ...packet, scene: { ...current, path: "/private/document" } },
    {
      ...packet,
      scene: {
        ...current,
        elements: [...current.elements, current.elements[1]],
      },
    },
    {
      ...packet,
      scene: mutate("input", (n) => ({ ...n, parentId: "button" })),
    },
    {
      ...packet,
      scene: mutate("input", (n) => ({ ...n, value: "bad\nvalue" })),
    },
    { ...packet, scene: mutate("button", (n) => ({ ...n, x: true })) },
    {
      ...packet,
      scene: mutate("card", (n) => ({
        ...n,
        style: { ...n.style, opacity: 2 },
      })),
    },
    {
      ...packet,
      scene: mutate("button", (n) => ({
        ...n,
        library: {
          ...n.library,
          props: { ...n.library.props, label: "Conflicting label" },
        },
      })),
    },
    {
      ...packet,
      scene: mutate("button", (n) => ({
        ...n,
        library: {
          ...n.library,
          variant: "Primary",
          props: { ...n.library.props, variant: "brand" },
        },
      })),
    },
    {
      ...packet,
      scene: mutate("button", (n) => ({
        ...n,
        library: {
          ...n.library,
          props: { ...n.library.props, appearance: "outlined" },
        },
      })),
    },
    { ...packet, scene: { ...current, sourceRevision: -1 } },
    { ...packet, scene: { ...current, width: 401 } },
    {
      ...packet,
      scene: mutate("input", (n) => ({
        ...n,
        style: { ...n.style, fill: "#763cba" },
      })),
    },
    {
      ...packet,
      scene: mutate("header", (n) => ({
        ...n,
        text: "Unsupported\nmultiline",
      })),
    },
    {
      ...packet,
      scene: mutate("header", (n) => ({
        ...n,
        style: { ...n.style, lineHeight: 2 },
      })),
    },
  ];
  for (const malformed of invalid) {
    const count = raw.length;
    native.owner.child.stdin.write(JSON.stringify(malformed) + "\n");
    const deadline = Date.now() + 2000;
    while (raw.length === count) {
      assert.ok(Date.now() < deadline, "Raw helper rejection timed out");
      await Bun.sleep(10);
    }
    const response = raw.at(-1);
    assert.equal(response.kind, "error");
    assert.equal(response.version, 2);
    assert.equal(response.code, "invalid_scene");
    records.push({ rejection: response });
  }
  const primary = mutate("button", (n) => ({
    ...n,
    library: {
      ...n.library,
      variant: "Primary",
      props: { ...n.library.props, variant: "brand" },
    },
  }));
  assert.throws(
    () => native.renderScene(primary),
    /variant Primary is unsupported/,
  );
  await render("after-rejection");
  const a = native.renderScene(scene()).then(
    () => "unexpected",
    (error) => String(error),
  );
  const b = await native.renderScene(scene());
  assert.match(await a, /superseded/);
  assert.equal(b.kind, "rendered");
  assert.ok(first.version === 2);
  await Bun.write(
    "build/library-preview-native/scene-report.json",
    JSON.stringify(
      {
        passed: true,
        build,
        records,
        checks: [
          "real sandboxed SwiftUI authored geometry within 0.1 logical point",
          "Default/Disabled",
          "nested named slots",
          "resolved fill/percent dimensions and fractional parent frames",
          "local Button/frame style overrides",
          "source undo/reset",
          "15 direct helper malformed/unsupported packets",
          "source checkpoint unchanged",
          "supersession",
        ],
        remaining: [
          "physical native keyboard/focus/action across scene updates",
          "editor diagnostics",
          "final four-runtime comparison and main integration",
        ],
        stats: native.owner.stats(),
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: real native authored scenes, geometry, nested slots, overrides, undo/reset and independent helper validation",
  );
} finally {
  native.stop();
  await native.owner.done.catch(() => {});
}
