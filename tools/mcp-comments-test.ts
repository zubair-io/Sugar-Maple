import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { homedir } from "node:os";
import { strict as assert } from "node:assert";
const token = await Bun.file(
    `${homedir()}/Library/Application Support/SugarMaple/mcp-token`,
  ).text(),
  c = new Client({ name: "Comment feedback acceptance", version: "1" });
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
const stateFile = Bun.file("build/evidence/comments-native-test.json");
if (process.argv[2] === "setup") {
  const before = await t("document.get"),
    page = crypto.randomUUID(),
    heading = crypto.randomUUID();
  const receipt = await t("transaction.apply", {
    documentId: before.documentId,
    expectedRevision: before.revision,
    requestId: crypto.randomUUID(),
    operations: [
      { type: "page.add", id: page, name: "Comment acceptance" },
      {
        type: "node.add",
        node: {
          id: heading,
          pageId: page,
          kind: "text",
          text: "Old heading",
          width: 360,
          height: 60,
          x: 100,
          y: 100,
          fontSize: 32,
        },
      },
    ],
  });
  await t("selection.set", { id: heading });
  await t("viewport.fit");
  await Bun.write(
    stateFile,
    JSON.stringify({ before, page, heading, revision: receipt.revision }),
  );
  console.log(
    "Use the Mac Comment tool, click the canvas, and post exactly one pinned comment: Make this heading clearer. Then run verify.",
  );
} else if (process.argv[2] === "verify") {
  const { before, page, heading, revision } = await stateFile.json();
  const list = await t("comments.list", { pageId: page });
  assert.equal(
    list.revision,
    revision + 1,
    "Intervening edits; do not modify or undo",
  );
  assert.equal(list.comments.length, 1);
  const thread = list.comments[0];
  assert.equal(thread.messages[0].author, "human");
  assert.ok(Number.isFinite(thread.anchor?.x) && Number.isFinite(thread.anchor?.y));
  assert.equal(thread.messages[0].text, "Make this heading clearer.");
  const tools = await c.listTools();
  assert.ok(tools.tools.find((t) => t.name === "comments.list"));
  const r = await t("transaction.apply", {
    documentId: before.documentId,
    expectedRevision: list.revision,
    requestId: crypto.randomUUID(),
    operations: [
      { type: "node.update", id: heading, patch: { text: "Your notebooks" } },
      {
        type: "comment.reply",
        id: thread.id,
        text: "Changed the heading to “Your notebooks”.",
      },
      { type: "comment.resolve", id: thread.id, resolved: true },
    ],
  });
  assert.equal((await t("comments.list", { pageId: page })).comments.length, 0);
  const resolved = await t("comments.list", {
    pageId: page,
    status: "resolved",
  });
  assert.equal(resolved.comments[0].resolvedBy, "agent");
  assert.equal(resolved.comments[0].messages[1].author, "agent");
  assert.equal(
    (await t("document.get")).document.nodes.find((n: any) => n.id === heading)
      .text,
    "Your notebooks",
  );
  const invalid: any = await c.callTool({
    name: "comments.list",
    arguments: { status: "invalid" },
  });
  assert.equal(invalid.isError, true);
  const cap: any = await c.callTool({
    name: "render.capture",
    arguments: { documentId: before.documentId, expectedRevision: r.revision },
  });
  assert.ok(!cap.isError);
  await Bun.write(
    "build/evidence/page-comments-native.png",
    Buffer.from(cap.content[0].data, "base64"),
  );
  // Three independent batches: fixture, human feedback, agent fix/reply/resolve.
  let rev = r.revision;
  for (let i = 0; i < 3; i++) {
    await t("history.undo", {
      documentId: before.documentId,
      expectedRevision: rev,
    });
    rev++;
  }
  assert.deepEqual((await t("document.get")).document, before.document);
  console.log(
    "PASS: native UI human feedback → MCP list → atomic agent edit/reply/resolve → status filtering/capture → three undos restore original document",
  );
} else throw Error("Usage: bun tools/mcp-comments-test.ts setup|verify");
await c.close();
