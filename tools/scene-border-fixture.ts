import { DocumentStore } from "../src/web/src/app/model/store";
export function sceneBorderFixture() {
  const store = new DocumentStore(),
    pageId = store.document.pages[0].id;
  store.transact({
    documentId: store.document.id,
    expectedRevision: 0,
    requestId: crypto.randomUUID(),
    operations: [
      {
        type: "node.add",
        node: {
          id: "border-root",
          pageId,
          kind: "artboard",
          width: 500,
          height: 400,
          padding: 0,
        },
      },
      {
        type: "node.add",
        node: {
          id: "border-frame",
          pageId,
          parentId: "border-root",
          kind: "frame",
          x: 27.31,
          y: 21.23,
          width: 340.73,
          height: 279.61,
          layout: "free",
          strokeWidth: 2.5,
          stroke: "#763cba",
          padding: 14.7,
          gap: 11.5,
          radius: 9,
        },
      },
      {
        type: "node.add",
        node: {
          id: "border-text",
          pageId,
          parentId: "border-frame",
          kind: "text",
          x: 15.23,
          y: 10.17,
          text: "Fractional border",
          width: 80.7,
          height: 25.1,
        },
      },
      {
        type: "node.add",
        node: {
          id: "border-button",
          pageId,
          parentId: "border-frame",
          kind: "button",
          x: 0,
          y: 60.1,
          widthMode: "fill",
          heightMode: "percent",
          heightPercent: 25,
          text: "Continue",
        },
      },
      {
        type: "node.add",
        node: {
          id: "border-input",
          pageId,
          parentId: "border-frame",
          kind: "input",
          x: 30.12,
          y: 155.43,
          widthMode: "percent",
          widthPercent: 60,
          height: 44.25,
          accessibleLabel: "Email",
        },
      },
    ],
  });
  return store;
}
