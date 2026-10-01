import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { tokenFile, mcpEndpoint } from "./mcp-config";
import { strict as assert } from "node:assert";
if (
  !process.env["SUGAR_MAPLE_SUPPORT_DIR"]?.endsWith(
    "/build/typography-qa/profile",
  )
)
  throw Error(
    "Typography acceptance requires the isolated typography QA profile.",
  );
const client = new Client({
  name: "Sugar Maple typography acceptance",
  version: "1",
});
await client.connect(
  new StreamableHTTPClientTransport(new URL(mcpEndpoint), {
    requestInit: {
      headers: { Authorization: `Bearer ${await Bun.file(tokenFile).text()}` },
    },
  }),
);
async function call(name: string, args: any = {}) {
  const result: any = await client.callTool({ name, arguments: args });
  if (result.isError) throw Error(JSON.stringify(result));
  return JSON.parse(result.content[0].text);
}
try {
  await call('document.new', { name: 'Typography QA' });
  const tools = await client.listTools();
  const schema = JSON.stringify(
    tools.tools.find((t) => t.name === "transaction.apply")!.inputSchema,
  );
  for (const property of [
    "fontFamily",
    "lineHeight",
    "letterSpacing",
    "textAlign",
  ])
    assert.ok(schema.includes(property));
  const before = await call("document.get"),
    pageId = before.document.pages[0].id;
  await call("transaction.apply", {
    documentId: before.documentId,
    expectedRevision: before.revision,
    requestId: crypto.randomUUID(),
    operations: [
      {
        type: "node.add",
        node: {
          id: "typography-board",
          pageId,
          kind: "artboard",
          name: "Typography acceptance",
          width: 600,
          height: 700,
          layout: "vertical",
          padding: 24,
          gap: 20,
        },
      },
      ...["Maple Sans", "monospace", "Helvetica"].map((fontFamily, i) => ({
        type: "node.add",
        node: {
          id: `typography-${i}`,
          pageId,
          parentId: "typography-board",
          kind: "text",
          name: fontFamily,
          text: "Design for clarity — Café Ελληνικά\n日本語 中文 العربية हिन्दी 👩🏽‍💻",
          widthMode: "fill",
          heightMode: "hug",
          fontFamily,
          fontSize: 24,
          fontWeight: 600,
          lineHeight: 1.6,
          letterSpacing: i === 0 ? 0.7 : 0,
          textAlign: i === 0 ? "center" : i === 1 ? "right" : "left",
        },
      })),
    ],
  });
  await call("selection.set", { id: "typography-0" });
  await call("viewport.fit");
  const current = await call("document.get"),
    revision = {
      documentId: current.documentId,
      expectedRevision: current.revision,
    };
  const capture: any = await client.callTool({
    name: "render.capture",
    arguments: revision,
  });
  assert.equal(capture.isError ?? false, false);
  const image = capture.content.find((c: any) => c.type === "image");
  assert.ok(image);
  await Bun.write(
    "build/evidence/native-typography.png",
    Buffer.from(image.data, "base64"),
  );
  const metadata = capture.structuredContent;
  assert.equal(metadata.rendered, true);
  assert.equal(metadata.durable, true);
  const code = await call("code.export", {
    id: "typography-board",
    target: "html",
  });
  assert.match(code.code, /data:font\/woff2;base64,/);
  assert.match(code.code, /letter-spacing:0.7px/);
  const unsupported: any = await client.callTool({
    name: "code.export",
    arguments: { id: "typography-board", target: "swiftui" },
  });
  assert.equal(unsupported.isError, true);
  const checkpoint = await call("document.checkpoint");
  assert.equal(
    checkpoint.document.nodes.find((n: any) => n.id === "typography-0")
      .fontFamily,
    "Maple Sans",
  );
  console.log(
    "PASS: actual WKWebView MCP advertises typography schema, commits durable scene, captures bundled/local Unicode Canvas text, emits embedded web font and rejects unsupported SwiftUI before output",
  );
} finally {
  await client.close();
}
