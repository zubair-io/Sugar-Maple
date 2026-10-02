import { test, expect } from "bun:test";
import { libraryFixture } from "../../tools/library-fixture";
import { project } from "../../src/web/src/app/canvas/scene-layout";
import { libraryKey } from "../../src/web/src/app/model/library-schema";
import { webAwesomeManifest } from "../../src/web/src/app/model/bundled-library";
import {
  projectLibraryScene,
  validateLibraryScene,
  nativeSceneDiagnostics,
  SceneSnapshotSchema,
  SceneEventSchema,
} from "./scene-contract";
const tx = (store: ReturnType<typeof libraryFixture>, operations: any[]) =>
  store.transact({
    documentId: store.document.id,
    expectedRevision: store.revision,
    requestId: crypto.randomUUID(),
    operations,
  });
const scene = (store: ReturnType<typeof libraryFixture>) =>
  projectLibraryScene(
    store.document,
    project(store.document, store.document.pages[0].id).find(
      (item) => item.node.id === "root",
    )!,
    store.revision,
  );

test("the bounded library scene carries resolved authored geometry and named slots without mutating the source", () => {
  const store = libraryFixture(),
    before = store.checkpoint(),
    output = scene(store);
  expect(output.documentId).toBe(store.document.id);
  expect(output.sourceRevision).toBe(store.revision);
  expect(output.elements.map((n) => n.id)).toEqual([
    "root",
    "card",
    "header",
    "input",
    "button",
  ]);
  const card = output.elements.find((n) => n.id === "card")!,
    input = output.elements.find((n) => n.id === "input")!,
    button = output.elements.find((n) => n.id === "button")!;
  expect({
    x: card.x,
    y: card.y,
    width: card.width,
    height: card.height,
  }).toEqual({ x: 20, y: 20, width: 360, height: 460 });
  expect({
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
  }).toEqual({ x: 24, y: 68, width: 260, height: 56 });
  expect({
    x: button.x,
    y: button.y,
    width: button.width,
    height: button.height,
  }).toEqual({ x: 24, y: 140, width: 180, height: 44 });
  expect(output.elements.find((n) => n.id === "header")!.slot).toBe("header");
  expect(button.slot).toBe("footer");
  expect(input.library!.props.value).toBe("consumer@example.test");
  expect(nativeSceneDiagnostics(output)).toEqual([]);
  expect(store.checkpoint()).toEqual(before);
});
test("source token bindings, local overrides and nested slots survive projection and one-step source undo", () => {
  const store = libraryFixture(),
    before = store.document;
  tx(store, [
    { type: "token.set", name: "brand.primary", value: "#145abc" },
    { type: "library.props", id: "button", props: {}, variant: "Primary" },
    {
      type: "node.update",
      id: "button",
      patch: {
        text: "Local label",
        color: "#ffffff",
        radius: 11,
        fillToken: "brand.primary",
      },
    },
    {
      type: "library.insert",
      key: libraryKey(webAwesomeManifest),
      component: "Card",
      id: "nested",
      x: 0,
      y: 0,
      pageId: store.document.pages[0].id,
      props: { padding: 5 },
    },
    {
      type: "node.update",
      id: "nested",
      patch: { parentId: "card", width: 180, height: 120 },
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
  const current = store.checkpoint(),
    output = scene(store),
    button = output.elements.find((n) => n.id === "button")!;
  expect(button.style.fill).toBe("#145abc");
  expect(button.text).toBe("Local label");
  expect(button.library!.props.label).toBe("Local label");
  expect(button.library!.localOverrides).toContain("color");
  expect(button.library!.localOverrides).toContain("radius");
  expect(button.library!.tokens["--wa-color-brand-fill-loud"]).toEqual({
    name: "brand.primary",
    value: "#145abc",
  });
  expect(output.elements.find((n) => n.id === "nested-header")!.parentId).toBe(
    "nested",
  );
  expect(output.elements.find((n) => n.id === "nested-header")!.slot).toBe(
    "header",
  );
  expect(nativeSceneDiagnostics(output)).toEqual([
    "button: native Button variant Primary is unsupported; use the semantic preview or a supported variant",
  ]);
  expect(store.checkpoint()).toEqual(current);
  store.undo();
  expect(store.document).toEqual(before);
});
test("resolved responsive boxes and nested rotations are carried instead of replacing them with package intrinsic sizes", () => {
  const store = libraryFixture();
  tx(store, [
    {
      type: "node.update",
      id: "input",
      patch: { widthMode: "fill", heightMode: "percent", heightPercent: 10 },
    },
    { type: "node.update", id: "button", patch: { rotation: 27 } },
  ]);
  const output = scene(store),
    input = output.elements.find((n) => n.id === "input")!,
    button = output.elements.find((n) => n.id === "button")!;
  expect(input.width).toBe(312);
  expect(input.height).toBeCloseTo(41.2, 8);
  expect(button.rotation).toBe(27);
  expect(input.library!.component).toBe("Input");
});
test("native style gaps return actionable diagnostics before replacing a supported scene", () => {
  const store = libraryFixture();
  tx(store, [
    {
      type: "node.update",
      id: "input",
      patch: { fill: "#763cba", radius: 7, letterSpacing: 2 },
    },
    {
      type: "node.update",
      id: "header",
      patch: { text: "Two\nlines", lineHeight: 2 },
    },
  ]);
  const checkpoint = store.checkpoint();
  expect(nativeSceneDiagnostics(scene(store))).toEqual([
    "header: native multiline text is unsupported; use semantic preview",
    "header: native lineHeight is unsupported; use semantic preview",
    "input: native Input style fill is unsupported; use semantic preview",
    "input: native Input style radius is unsupported; use semantic preview",
    "input: native Input style letterSpacing is unsupported; use semantic preview",
  ]);
  expect(store.checkpoint()).toEqual(checkpoint);
});
test("scene packets reject inconsistent graphs, unsupported source, privileged keys and aggregate payload excess", () => {
  const store = libraryFixture(),
    output = scene(store);
  for (const invalid of [
    { ...output, sourceRevision: -1 },
    { ...output, elements: [...output.elements, output.elements[1]] },
    {
      ...output,
      elements: output.elements.map((n) =>
        n.id === "input" ? { ...n, parentId: "button" } : n,
      ),
    },
    {
      ...output,
      elements: output.elements.map((n) =>
        n.id === "card" ? { ...n, slot: "header" } : n,
      ),
    },
    {
      ...output,
      elements: output.elements.map((n) =>
        n.id === "button"
          ? {
              ...n,
              library: {
                ...n.library!,
                props: { ...n.library!.props, label: "Conflicting label" },
              },
            }
          : n,
      ),
    },
    {
      ...output,
      elements: output.elements
        .map((n) => ({ ...n, text: "x".repeat(20000), library: null }))
        .concat(
          Array.from({ length: 20 }, (_, i) => ({
            ...output.elements[2],
            id: "large-" + i,
            text: "x".repeat(20000),
          })),
        ),
    },
  ])
    expect(() => validateLibraryScene(invalid)).toThrow();
  const packet = {
    version: 2,
    session: crypto.randomUUID(),
    revision: 0,
    kind: "render-scene",
    scene: output,
    reset: false,
  };
  expect(SceneSnapshotSchema.parse(packet)).toEqual(packet);
  for (const extra of [
    { method: "transaction.apply" },
    { path: "/private/document" },
    { code: "alert(1)" },
    { version: 1 },
  ])
    expect(() => SceneSnapshotSchema.parse({ ...packet, ...extra })).toThrow();
  const event = {
    version: 2,
    session: packet.session,
    revision: 0,
    kind: "change",
    nodeId: "input",
    value: "local@example.test",
  };
  expect(SceneEventSchema.parse(event)).toEqual(event);
  expect(() =>
    SceneEventSchema.parse({ ...event, method: "asset.set" }),
  ).toThrow();
  const root = project(store.document, store.document.pages[0].id)[0];
  tx(store, [
    { type: "node.update", id: "header", patch: { text: "Changed" } },
  ]);
  expect(() =>
    projectLibraryScene(store.document, root, store.revision),
  ).toThrow("Layout/source changed");
  tx(store, [
    {
      type: "node.update",
      id: "header",
      patch: { fontFamily: "Unknown Font" },
    },
  ]);
  expect(() => scene(store)).toThrow("unsupported preview font");
});
