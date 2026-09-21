import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { homedir } from "node:os";
import { strict as assert } from "node:assert";
const token = await Bun.file(
  `${homedir()}/Library/Application Support/SugarMaple/mcp-token`,
).text();
const client = new Client({ name: "Component acceptance", version: "1" });
await client.connect(
  new StreamableHTTPClientTransport(new URL("http://127.0.0.1:48480/mcp"), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }),
);
async function tool(name: string, args: any = {}) {
  const result: any = await client.callTool({ name, arguments: args });
  if (result.isError) throw Error(JSON.stringify(result));
  return JSON.parse(result.content[0].text);
}
const before = await tool("document.get");
const id = crypto.randomUUID(),
  master = id + "-master",
  label = id + "-label";
let revision = before.revision;
async function transact(operations: any[]) {
  const result = await tool("transaction.apply", {
    documentId: before.documentId,
    expectedRevision: revision,
    requestId: crypto.randomUUID(),
    operations,
  });
  revision = result.revision;
  return result;
}
await transact([
  { type: "page.add", id, name: "Component transport acceptance" },
  {
    type: "node.add",
    node: {
      id: master,
      pageId: id,
      kind: "frame",
      name: "Card",
      width: 260,
      height: 160,
      isComponent: true,
      variants: { Selected: { fill: "#dbeafe" } },
    },
  },
  { type: "component.insert", id: master, pageId: id, x: 320, y: 0 },
]);
let state = await tool("document.get");
const instance = state.document.nodes.find(
  (n: any) => n.componentId === master,
);
const changed = await transact([
  {
    type: "node.add",
    node: {
      id: label,
      parentId: master,
      pageId: id,
      kind: "text",
      text: "Synchronized label",
      x: 16,
      y: 16,
    },
  },
  { type: "component.variant", id: instance.id, name: "Selected" },
]);
state = await tool("document.get");
const inherited = state.document.nodes.find(
  (n: any) => n.componentId === label,
);
assert.equal(inherited.parentId, instance.id);
assert.equal(
  state.document.nodes.find((n: any) => n.id === instance.id).fill,
  "#dbeafe",
);
await tool("selection.set", { id: instance.id });
await tool("viewport.fit");
const layout = await tool("layout.inspect");
assert.equal(layout.revision, changed.revision);
assert.ok(layout.nodes.find((n: any) => n.id === inherited.id)?.rendered);
const capture: any = await client.callTool({
  name: "render.capture",
  arguments: {
    documentId: before.documentId,
    expectedRevision: changed.revision,
  },
});
assert.ok(!capture.isError);
await Bun.write(
  "build/evidence/native-components.png",
  Buffer.from(capture.content[0].data, "base64"),
);
await transact([
  {
    type: "node.update",
    id: inherited.id,
    patch: { text: "Local override", x: 40 },
  },
]);
await transact([{ type: "component.reset", id: instance.id }]);
state = await tool("document.get");
assert.equal(
  state.document.nodes.find((n: any) => n.id === inherited.id).text,
  "Synchronized label",
);
assert.equal(
  state.document.nodes.find((n: any) => n.id === inherited.id).x,
  16,
);
// Undo exactly the four test batches. Revision checks protect against interleaved edits.
assert.equal(
  state.revision,
  revision,
  "Unexpected intervening edit; do not undo",
);
for (let i = 0; i < 4; i++) {
  await tool("history.undo", {
    documentId: before.documentId,
    expectedRevision: revision,
  });
  revision++;
}
assert.deepEqual((await tool("document.get")).document, before.document);
await client.close();
console.log(
  "PASS: native MCP component structural sync, variant, visible geometry/capture, override reset, four atomic undos",
);
