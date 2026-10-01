import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { supportDirectory, tokenFile, mcpEndpoint } from './mcp-config';
import { strict as assert } from "node:assert";
// A just-launched host can briefly expose an old credential or a loading editor.
let token = '';
const readinessDeadline = Date.now() + 15000;
while (!token) {
  try {
    const credential = (await Bun.file(tokenFile).text()).trim();
    const response = await fetch(mcpEndpoint, {
      method: 'POST', headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'acceptance-readiness', method: 'tools/list' }),
      signal: AbortSignal.timeout(1000),
    });
    if (response.ok && Array.isArray((await response.json() as any).result?.tools)) token = credential;
  } catch { /* Retry readiness without logging credentials. */ }
  if (!token) {
    if (Date.now() >= readinessDeadline) throw Error('MCP host is not ready; launch Sugar Maple and check its MCP status and configured port.');
    await Bun.sleep(100);
  }
}
const http = new Client({ name: "Sugar Maple acceptance", version: "1" });
await http.connect(
  new StreamableHTTPClientTransport(new URL(mcpEndpoint), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }),
);
const discovered = await http.listTools();
assert.equal(discovered.tools.length, 15);
assert.ok(discovered.tools.every((tool) => tool.outputSchema?.type === 'object'));
async function tool(name: string, args: any = {}) {
  const result: any = await http.callTool({ name, arguments: args });
  if (result.isError) throw Error(JSON.stringify(result));
  const value = JSON.parse(result.content[0].text);
  assert.deepEqual(result.structuredContent, value);
  return value;
}
async function assertAutosaved(document: any) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const bindings = await Bun.file(
        `${supportDirectory}/file-bindings.json`,
      ).json();
      const url = new URL(bindings[document.id].url);
      const saved = await Bun.file(
        new URL("document.json", url.href.replace(/\/?$/, "/")),
      ).json();
      if (JSON.stringify(saved.document) === JSON.stringify(document)) return;
      // Native JSON uses sorted keys; compare structurally.
      assert.deepEqual(saved.document, document);
      return;
    } catch {
      await Bun.sleep(100);
    }
  }
  throw Error("Current document did not reach its autosave package");
}
const capabilityResult = await tool('capabilities');
assert.equal(capabilityResult.protocolVersion, 1);
const current = await tool("document.get");
assert.equal((await tool('comments.list')).documentId, current.documentId);
const id = crypto.randomUUID();
const tx = {
  documentId: current.documentId,
  expectedRevision: current.revision,
  requestId: crypto.randomUUID(),
  operations: [
    { type: "page.add", id, name: "MCP acceptance" },
    {
      type: "node.add",
      node: {
        id: id + "-board",
        pageId: id,
        kind: "artboard",
        name: "MCP acceptance board",
        width: 600,
        height: 400,
        x: 0,
        y: 0,
      },
    },
    {
      type: "node.add",
      node: {
        id: id + "-text",
        pageId: id,
        parentId: id + "-board",
        kind: "text",
        text: "Agent → live editor",
        x: 32,
        y: 32,
        width: 400,
        height: 60,
      },
    },
    {
      type: "node.add",
      node: {
        id: id + "-shape",
        pageId: id,
        parentId: id + "-board",
        kind: "rectangle",
        fill: "#2563eb",
        x: 32,
        y: 120,
        width: 240,
        height: 120,
      },
    },
  ],
};
const created = await tool("transaction.apply", tx);
await assertAutosaved((await tool("document.get")).document);
const checkpoint = await tool('document.checkpoint');
assert.equal(checkpoint.checkpointVersion, 2);
assert.equal(checkpoint.document.id, current.documentId);
assert.equal((await tool('layout.inspect')).documentId, current.documentId);
assert.equal((await tool("transaction.apply", tx)).revision, created.revision);
const stale: any = await http.callTool({
  name: "transaction.apply",
  arguments: { ...tx, requestId: crypto.randomUUID() },
});
assert.equal(stale.isError, true);
assert.equal(stale.structuredContent.error.code, 'stale_revision');
assert.equal(stale.structuredContent.error.revision, created.revision);
const wrong: any = await http.callTool({name:'history.undo',arguments:{documentId:'wrong-document',expectedRevision:created.revision}});
assert.equal(wrong.structuredContent.error.code,'wrong_document');
const invalidTarget: any = await http.callTool({name:'code.export',arguments:{id:id+'-board',target:'png'}});
assert.equal(invalidTarget.isError,true);
assert.equal(invalidTarget.structuredContent.error.code,'invalid_input');
const invalidBatch: any = await http.callTool({name:'transaction.apply',arguments:{documentId:current.documentId,expectedRevision:created.revision,requestId:crypto.randomUUID(),operations:[{type:'node.update',id:id+'-shape',patch:{width:0}}]}});
assert.equal(invalidBatch.structuredContent.error.code,'invalid_input');
assert.equal((await tool('document.get')).revision,created.revision);
await tool("selection.set", { id: id + "-board" });
await tool("viewport.fit");
const layout = await tool("layout.inspect");
assert.equal(layout.revision, created.revision);
assert.equal(
  layout.nodes.filter((n: any) => n.rendered && n.bounds.width > 0).length,
  3,
);
assert.ok(
  (
    await tool("code.export", { id: id + "-board", target: "swiftui" })
  ).code.includes("Agent → live editor"),
);
const captured: any = await http.callTool({
  name: "render.capture",
  arguments: {
    documentId: current.documentId,
    expectedRevision: created.revision,
  },
});
assert.ok(!captured.isError);
assert.equal(captured.content[0].mimeType, "image/png");
const captureStatus=JSON.parse(captured.content[1].text);
assert.deepEqual(captured.structuredContent,captureStatus);
assert.equal(captureStatus.revision,created.revision);assert.equal(captureStatus.rendered,true);assert.equal(captureStatus.committed,true);
await Bun.write(
  "build/evidence/mcp-created-elements.png",
  Buffer.from(captured.content[0].data, "base64"),
);
await tool("history.undo", {
  documentId: current.documentId,
  expectedRevision: created.revision,
});
assert.deepEqual((await tool("document.get")).document, current.document);
await assertAutosaved(current.document);
const beforeRedo = await tool('document.get');
await tool('history.redo', { documentId: current.documentId, expectedRevision: beforeRedo.revision });
assert.ok((await tool('document.get')).document.nodes.some((node: any) => node.id === id + '-board'));
const afterRedo = await tool('document.get');
await tool('history.undo', { documentId: current.documentId, expectedRevision: afterRedo.revision });
assert.deepEqual((await tool('document.get')).document, current.document);
await assertAutosaved(current.document);
const denied = await fetch(mcpEndpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "{}",
});
assert.equal(denied.status, 401);
const origin = await fetch(mcpEndpoint, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    Origin: "https://example.com",
    "Content-Type": "application/json",
  },
  body: "{}",
});
assert.equal(origin.status, 403);
const foreignHost = await fetch(mcpEndpoint, {
  method: 'POST', headers: { Authorization: `Bearer ${token}`, Host: 'foreign.example', 'Content-Type': 'application/json' }, body: '{}',
});
assert.equal(foreignHost.status, 403);
const malformed = await fetch(mcpEndpoint, {
  method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{',
});
assert.equal(malformed.status, 400);
const invalidArguments = await fetch(mcpEndpoint, {
  method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({jsonrpc:'2.0',id:'invalid-arguments',method:'tools/call',params:{name:'document.get',arguments:[]}}),
});
const invalidEnvelope = await invalidArguments.json() as any;
assert.equal(invalidEnvelope.result.isError, true);
assert.equal(invalidEnvelope.result.structuredContent.error.code, 'invalid_input');
assert.deepEqual((await tool('document.get')).document, current.document);
const stdio = new Client({ name: "stdio acceptance", version: "1" });
await stdio.connect(
  new StdioClientTransport({ command: "bun", args: ["tools/mcp-stdio.ts"], env: Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string,string] => entry[1] !== undefined)) }),
);
const stdioDiscovery = await stdio.listTools();
assert.deepEqual(stdioDiscovery.tools.map(t => t.outputSchema), discovered.tools.map(t => t.outputSchema));
const same: any = await stdio.callTool({ name: "document.get", arguments: {} });
assert.equal(JSON.parse(same.content[0].text).documentId, current.documentId);
const stdioInvalid: any = await stdio.callTool({name:'code.export',arguments:{id:id+'-board',target:'png'}});
assert.equal(stdioInvalid.isError,true);assert.equal(stdioInvalid.structuredContent.error.code,'invalid_input');
await stdio.close();
await http.close();
console.log(
  "PASS: official MCP SDK HTTP + stdio, canvas capture, exact revision, durable autosave, atomic edit/undo, retry, typed stale/wrong/invalid errors, discovered output-schema validation, structured success/errors, malformed input, token/Origin/Host rejection",
);
