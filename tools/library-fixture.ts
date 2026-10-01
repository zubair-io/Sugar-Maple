import { DocumentStore } from "../src/web/src/app/model/store";
import { libraryKey } from "../src/web/src/app/model/library-schema";
import { webAwesomeManifest as manifest } from "../src/web/src/app/model/bundled-library";
export { webAwesomeManifest } from "../src/web/src/app/model/bundled-library";
export function libraryFixture() {
  const store = new DocumentStore(),
    pageId = store.document.pages[0].id,
    key = libraryKey(manifest);
  store.transact({
    documentId: store.document.id,
    expectedRevision: 0,
    requestId: crypto.randomUUID(),
    operations: [
      { type: "library.import", manifest },
      {
        type: "node.add",
        node: {
          id: "root",
          pageId,
          kind: "artboard",
          width: 400,
          height: 500,
          padding: 0,
        },
      },
      {
        type: "library.insert",
        key,
        component: "Card",
        id: "card",
        pageId,
        x: 20,
        y: 20,
        props: { padding: 24 },
      },
      {
        type: "node.update",
        id: "card",
        patch: { parentId: "root", width: 360, height: 460 },
      },
      {
        type: "node.add",
        node: {
          id: "header",
          pageId,
          parentId: "card",
          kind: "text",
          text: "Pinned library consumer",
          librarySlot: "header",
          width: 300,
          height: 28,
        },
      },
      {
        type: "library.insert",
        key,
        component: "Input",
        id: "input",
        pageId,
        x: 0,
        y: 0,
        props: { value: "consumer@example.test", label: "Email" },
      },
      { type: "node.update", id: "input", patch: { parentId: "card" } },
      {
        type: "library.insert",
        key,
        component: "Button",
        id: "button",
        pageId,
        x: 0,
        y: 0,
        props: { label: "Save & Continue" },
      },
      {
        type: "node.update",
        id: "button",
        patch: { parentId: "card", librarySlot: "footer" },
      },
    ],
  });
  return store;
}
