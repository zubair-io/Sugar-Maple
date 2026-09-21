import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { homedir } from "node:os";
import { strict as assert } from "node:assert";
const client = new Client({ name: "Native pointer acceptance", version: "1" });
const token = await Bun.file(
  `${homedir()}/Library/Application Support/SugarMaple/mcp-token`,
).text();
await client.connect(
  new StreamableHTTPClientTransport(new URL("http://127.0.0.1:48480/mcp"), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }),
);
async function tool(name: string, args: any = {}) {
  const r: any = await client.callTool({ name, arguments: args });
  if (r.isError) throw Error(JSON.stringify(r));
  return JSON.parse(r.content[0].text);
}
try {
  if (process.argv[2] === "setup") {
    const before = await tool("document.get"),
      id = crypto.randomUUID();
    const receipt = await tool("transaction.apply", {
      documentId: before.documentId,
      expectedRevision: before.revision,
      requestId: crypto.randomUUID(),
      operations: [
        { type: "page.add", id, name: "Native pointer acceptance" },
        {
          type: "node.add",
          node: {
            id: id + "-board",
            pageId: id,
            kind: "artboard",
            name: "Native test board",
            width: 600,
            height: 400,
          },
        },
        {
          type: "node.add",
          node: {
            id: id + "-rect",
            pageId: id,
            parentId: id + "-board",
            kind: "rectangle",
            name: "Drag this rectangle",
            x: 40,
            y: 60,
            width: 200,
            height: 100,
            fill: "#2563eb",
          },
        },
        {
          type: "node.add",
          node: {
            id: id + "-text",
            pageId: id,
            parentId: id + "-board",
            kind: "text",
            text: "MCP → pointer → MCP",
            x: 40,
            y: 200,
            width: 400,
            height: 40,
          },
        },
      ],
    });
    await Bun.write(
      "build/evidence/native-pointer-state.json",
      JSON.stringify({ before, receipt, id }),
    );
    await tool("selection.set", { id: id + "-rect" });
    await tool("viewport.fit");
    console.log(
      "Fixture ready. Drag the blue rectangle once in the Mac app, then run this script with verify.",
    );
  } else if (process.argv[2] === "verify") {
    const { before, receipt, id } = await Bun.file(
      "build/evidence/native-pointer-state.json",
    ).json();
    const current = await tool("document.get"),
      rect = current.document.nodes.find((n: any) => n.id === id + "-rect");
    assert.ok(
      rect && (rect.x !== 40 || rect.y !== 60),
      "Pointer must move the rectangle",
    );
    assert.equal(
      current.revision,
      receipt.revision + 1,
      "Exactly one pointer gesture expected",
    );
    const capture: any = await client.callTool({
      name: "render.capture",
      arguments: {
        documentId: current.documentId,
        expectedRevision: current.revision,
      },
    });
    assert.ok(!capture.isError);
    await Bun.write(
      "build/evidence/native-pointer.png",
      Buffer.from(capture.content[0].data, "base64"),
    );
    const undone = await tool("history.undo", {
      documentId: current.documentId,
      expectedRevision: current.revision,
    });
    await tool("history.undo", {
      documentId: current.documentId,
      expectedRevision: undone.revision,
    });
    assert.deepEqual((await tool("document.get")).document, before.document);
    console.log(
      "PASS: native pointer edit read through MCP; two independent undos restore original document",
    );
  } else throw Error("Use setup or verify");
} finally {
  await client.close();
}
