import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { homedir } from "node:os";
import { strict as assert } from "node:assert";
const token = await Bun.file(
  `${homedir()}/Library/Application Support/SugarMaple/mcp-token`,
).text();
const http = new Client({ name: "Sugar Maple acceptance", version: "1" });
await http.connect(
  new StreamableHTTPClientTransport(new URL("http://127.0.0.1:48480/mcp"), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }),
);
async function tool(name: string, args: any = {}) {
  const result: any = await http.callTool({ name, arguments: args });
  if (result.isError) throw Error(JSON.stringify(result));
  return JSON.parse(result.content[0].text);
}
const current = await tool("document.get");
const id = crypto.randomUUID();
const tx = {
  documentId: current.documentId,
  expectedRevision: current.revision,
  requestId: crypto.randomUUID(),
  operations: [{ type: "page.add", id, name: "MCP acceptance" }],
};
const created = await tool("transaction.apply", tx);
assert.equal((await tool("transaction.apply", tx)).revision, created.revision);
const stale: any = await http.callTool({
  name: "transaction.apply",
  arguments: { ...tx, requestId: crypto.randomUUID() },
});
assert.equal(stale.isError, true);
await tool("history.undo", {
  documentId: current.documentId,
  expectedRevision: created.revision,
});
assert.deepEqual((await tool("document.get")).document, current.document);
const denied = await fetch("http://127.0.0.1:48480/mcp", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "{}",
});
assert.equal(denied.status, 401);
const origin = await fetch("http://127.0.0.1:48480/mcp", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    Origin: "https://example.com",
    "Content-Type": "application/json",
  },
  body: "{}",
});
assert.equal(origin.status, 403);
const stdio = new Client({ name: "stdio acceptance", version: "1" });
await stdio.connect(
  new StdioClientTransport({ command: "bun", args: ["tools/mcp-stdio.ts"] }),
);
const same: any = await stdio.callTool({ name: "document.get", arguments: {} });
assert.equal(JSON.parse(same.content[0].text).documentId, current.documentId);
await stdio.close();
await http.close();
console.log(
  "PASS: official MCP SDK HTTP + stdio, shared document, atomic edit/undo, retry, stale revision, token and Origin rejection",
);
