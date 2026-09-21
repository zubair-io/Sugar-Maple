import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { homedir } from "node:os";
import { maplePhone } from "../src/web/tests/fixtures/maple-phone";
import { DocumentStore } from "../src/web/src/app/model/store";
const client = new Client({ name: "Maple reference drawing", version: "1" });
const token = await Bun.file(
  `${homedir()}/Library/Application Support/SugarMaple/mcp-token`,
).text();
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
try {
  const current = await tool("document.get"),
    pageId = crypto.randomUUID(),
    prefix = "reference-" + crypto.randomUUID();
  const receipt = await tool("transaction.apply", {
    documentId: current.documentId,
    expectedRevision: current.revision,
    requestId: crypto.randomUUID(),
    operations: [
      { type: "page.add", id: pageId, name: "Maple · Phone drawing test" },
      ...maplePhone(pageId, prefix),
    ],
  });
  await tool("selection.set", { id: prefix + "-screen" });
  await tool("viewport.fit");
  const checkpoint = await tool("document.checkpoint");
  DocumentStore.fromCheckpoint(checkpoint);
  await Bun.write(
    "build/evidence/Maple-reference.syrup/document.json",
    JSON.stringify(checkpoint, null, 2),
  );
  const captured: any = await client.callTool({
    name: "render.capture",
    arguments: {
      documentId: current.documentId,
      expectedRevision: receipt.revision,
    },
  });
  if (captured.isError) throw Error(JSON.stringify(captured));
  await Bun.write(
    "build/evidence/maple-reference-native.png",
    Buffer.from(captured.content[0].data, "base64"),
  );
  console.log(
    "Created 37 editable reference nodes on a new page. One undo removes this entire drawing test. Saved a verified checkpoint to build/evidence/Maple-reference.syrup.",
  );
} finally {
  await client.close();
}
