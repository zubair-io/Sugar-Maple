import { DocumentStore } from "../src/web/src/app/model/store";
import { exportNode } from "../src/web/src/app/model/export";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
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
        id: "root",
        pageId,
        kind: "frame",
        layout: "vertical",
        width: 400,
        height: 600,
      },
    },
    ...["text", "button", "input"].map((kind, i) => ({
      type: "node.add" as const,
      node: {
        id: `label-${i}`,
        parentId: "root",
        pageId,
        kind,
        text: "Café Ελληνικά 日本語 👩🏽‍💻",
        fontFamily: i === 0 ? "serif" : i === 1 ? "monospace" : "system-ui",
        fontSize: 20,
        letterSpacing: 1.5,
        textAlign: "right",
      },
    })),
  ],
});
const output = resolve("build/native-acceptance/typography-consumer.swift");
mkdirSync(resolve("build/native-acceptance"), { recursive: true });
await Bun.write(output, exportNode(store.document, "root", "swiftui"));
const compile = Bun.spawn(["swiftc", "-typecheck", output], {
  stdout: "inherit",
  stderr: "inherit",
});
if (await compile.exited)
  throw Error("SwiftUI typography consumer failed to compile");
console.log(
  "PASS: generated SwiftUI serif, monospaced, tracking and multiline alignment consumer compiles against the actual SDK",
);
