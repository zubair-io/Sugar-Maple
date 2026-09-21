import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { homedir } from "node:os";
import { strict as assert } from "node:assert";
const support = `${homedir()}/Library/Application Support/SugarMaple`;
const token = await Bun.file(`${support}/mcp-token`).text();
const client = new Client({ name: "Native history acceptance", version: "1" });
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
const file = Bun.file("build/evidence/native-history-test.json");
if (process.argv[2] === "setup") {
  const before = await tool("document.get");
  const tx = {
    documentId: before.documentId,
    expectedRevision: before.revision,
    requestId: crypto.randomUUID(),
    operations: [
      {
        type: "page.add",
        id: crypto.randomUUID(),
        name: "Restart recovery acceptance",
      },
    ],
  };
  const receipt = await tool("transaction.apply", tx);
  const after = await tool("document.get");
  await Bun.write(file, JSON.stringify({ before, after, tx, receipt }));
  // Wait for the actual native recovery file, not merely the committed response.
  for (let i = 0; i < 50; i++) {
    const checkpoint = await Bun.file(`${support}/recovery.json`).json();
    if (
      checkpoint.document.pages.some((p: any) => p.id === tx.operations[0].id)
    )
      break;
    if (i === 49) throw Error("Native recovery was not written");
    await Bun.sleep(100);
  }
  console.log(
    "Prepared one temporary page. Quit and reopen the Mac app, then run this script with verify.",
  );
} else if (process.argv[2] === "verify") {
  const { before, after, tx, receipt } = await file.json();
  const current = await tool("document.get");
  assert.equal(
    current.revision,
    after.revision,
    "Unexpected intervening edits; do not undo",
  );
  assert.deepEqual(current.document, after.document);
  assert.deepEqual(
    await tool("transaction.apply", tx),
    receipt,
    "Retry receipt survives restart",
  );
  await tool("history.undo", {
    documentId: current.documentId,
    expectedRevision: current.revision,
  });
  assert.deepEqual((await tool("document.get")).document, before.document);
  await tool("history.redo", {
    documentId: current.documentId,
    expectedRevision: current.revision + 1,
  });
  assert.deepEqual((await tool("document.get")).document, after.document);
  await tool("history.undo", {
    documentId: current.documentId,
    expectedRevision: current.revision + 2,
  });
  assert.deepEqual((await tool("document.get")).document, before.document);
  console.log(
    "PASS: native app restart retains scene, revision, retry receipts, undo and redo; original document restored",
  );
} else throw Error("Usage: bun tools/native-history-test.ts setup|verify");
await client.close();
