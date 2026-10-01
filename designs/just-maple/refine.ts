import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { homedir } from "node:os";
import { DocumentStore } from "../../src/web/src/app/model/store";
import { exportNode } from "../../src/web/src/app/model/export";
const c = new Client({ name: "Design refinement", version: "1" }),
  token = await Bun.file(
    `${homedir()}/Library/Application Support/SugarMaple/mcp-token`,
  ).text();
await c.connect(
  new StreamableHTTPClientTransport(new URL("http://127.0.0.1:48480/mcp"), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }),
);
async function t(name: string, args: any = {}) {
  const r: any = await c.callTool({ name, arguments: args });
  if (r.isError) throw Error(JSON.stringify(r));
  return JSON.parse(r.content[0].text);
}
const { roots, pages } = await Bun.file(
  "designs/just-maple/screens.json",
).json();
const old = await Bun.file(
  "designs/just-maple/Just Maple.syrup/document.json",
).json();
const s = await t("document.get"),
  ops: any[] = [];
for (const n of s.document.nodes.filter((n: any) =>
  pages.some((p: any) => p.id === n.pageId),
)) {
  if (n.text === "A little context.\nA more useful everyday.")
    ops.push({
      type: "node.update",
      id: n.id,
      patch: {
        text: "A little context.\nA clearer everyday.",
        fontSize: 21,
        height: 60,
      },
    });
  if (n.text === "2 to review")
    ops.push({ type: "node.update", id: n.id, patch: { text: "1 to review" } });
  if (n.name === "Sidebar divider")
    ops.push({ type: "node.update", id: n.id, patch: { y: 405 } });
  if (n.text === "Dismiss")
    ops.push({ type: "node.update", id: n.id, patch: { targetId: null } });
}
await t("transaction.apply", {
  documentId: s.documentId,
  expectedRevision: s.revision,
  requestId: crypto.randomUUID(),
  operations: ops,
});
const d = await t("document.get");
old.document.nodes = d.document.nodes.filter((n: any) =>
  pages.some((p: any) => p.id === n.pageId),
);
await Bun.write(
  "designs/just-maple/Just Maple.syrup/document.json",
  JSON.stringify(new DocumentStore(old.document).checkpoint(), null, 2),
);
for (const [key, id] of Object.entries(roots))
  await Bun.write(
    `designs/just-maple/previews/${key}.html`,
    `<!doctype html><html><meta charset="utf-8"><style>p{white-space:pre-wrap}</style><body style="margin:0;background:#fdfbf7">${exportNode(old.document, id as string, "html")}</body></html>`,
  );
await c.close();
console.log("Refined sidebar typography and attention count in Sugar Maple.");
