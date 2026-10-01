import { test, expect } from "bun:test";
import { NodeSchema, blankDocument } from "./model/schema";
import { project, flatten, hit } from "./layout";
import { DocumentStore } from "./model/store";
const scene = () => {
  const d = blankDocument(),
    page = d.pages[0].id;
  d.nodes = [
    NodeSchema.parse({
      id: "board",
      pageId: page,
      kind: "artboard",
      name: "Board",
      width: 500,
      height: 300,
      padding: 20,
      layout: "horizontal",
      gap: 10,
    }),
    NodeSchema.parse({
      id: "fixed",
      pageId: page,
      parentId: "board",
      kind: "button",
      name: "Fixed",
      width: 100,
      height: 40,
      order: 0,
    }),
    NodeSchema.parse({
      id: "fill",
      pageId: page,
      parentId: "board",
      kind: "button",
      name: "Fill",
      widthMode: "fill",
      height: 40,
      order: 1,
    }),
  ];
  return d;
};
test("horizontal fixed/fill layout honors padding, gaps and authored order", () => {
  const d = scene();
  const items = flatten(project(d, d.pages[0].id));
  expect(items.map((i) => i.node.id)).toEqual(["board", "fixed", "fill"]);
  expect(items[1].x).toBe(20);
  expect(items[2].x).toBe(130);
  expect(items[2].width).toBe(350);
});
test("hit testing selects the topmost visible child and respects parent clipping", () => {
  const d = scene();
  d.nodes[0].layout = "free";
  d.nodes[2].x = 480;
  d.nodes[2].width = 100;
  d.nodes[2].widthMode = "fixed";
  const items = flatten(project(d, d.pages[0].id));
  expect(hit(items, 490, 25)?.node.id).toBe("fill");
  expect(hit(items, 530, 25)).toBeUndefined();
});
test("pointer batch uses the real store, undo restores geometry and rejects invalid sizes atomically", () => {
  const store = new DocumentStore(scene()),
    before = store.document;
  const edit = (patch: any) =>
    store.transact({
      documentId: before.id,
      expectedRevision: store.revision,
      requestId: crypto.randomUUID(),
      operations: [{ type: "node.update", id: "fixed", patch }],
    });
  edit({ x: 12, y: 18 });
  expect(store.document.nodes[1].x).toBe(12);
  store.undo();
  expect(store.document).toEqual(before);
  expect(() => edit({ width: 0 })).toThrow();
  expect(store.document).toEqual(before);
});
