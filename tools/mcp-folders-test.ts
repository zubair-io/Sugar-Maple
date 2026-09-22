import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { homedir } from "node:os";
import { strict as assert } from "node:assert";
const token = await Bun.file(
    `${homedir()}/Library/Application Support/SugarMaple/mcp-token`,
  ).text(),
  c = new Client({ name: "Folder acceptance", version: "1" });
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
const before = await t("document.get"),
  folder = crypto.randomUUID(),
  page = crypto.randomUUID();
let revision = before.revision;
async function tx(operations: any[]) {
  const r = await t("transaction.apply", {
    documentId: before.documentId,
    expectedRevision: revision,
    requestId: crypto.randomUUID(),
    operations,
  });
  revision = r.revision;
}
await tx([
  { type: "folder.add", id: folder, name: "Folder transport test" },
  { type: "page.add", id: page, name: "Nested page", folderId: folder },
]);
let d = await t("document.get");
assert.equal(d.document.pages.find((p: any) => p.id === page).folderId, folder);
const capture: any = await c.callTool({
  name: "render.capture",
  arguments: { documentId: before.documentId, expectedRevision: revision },
});
assert.ok(!capture.isError);
await Bun.write(
  "build/evidence/page-folders-native.png",
  Buffer.from(capture.content[0].data, "base64"),
);
await tx([
  { type: "folder.update", id: folder, name: "Renamed folder" },
  { type: "page.update", id: page, folderId: null },
]);
await tx([
  { type: "page.update", id: page, folderId: folder },
  { type: "folder.remove", id: folder },
]);
d = await t("document.get");
assert.equal(d.document.pages.find((p: any) => p.id === page).folderId, null);
for (let i = 0; i < 3; i++) {
  await t("history.undo", {
    documentId: before.documentId,
    expectedRevision: revision,
  });
  revision++;
}
assert.deepEqual((await t("document.get")).document, before.document);
await c.close();
console.log(
  "PASS: native MCP folder create/rename/move/remove/render and undo preserve the original document.",
);
