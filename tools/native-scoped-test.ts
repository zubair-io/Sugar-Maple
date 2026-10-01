import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { strict as assert } from "node:assert";
import { tokenFile, mcpEndpoint, supportDirectory } from "./mcp-config";
if (
  !supportDirectory.endsWith("/build/scoped-qa/profile") ||
  process.env["SUGAR_MAPLE_MCP_PORT"] !== "48489"
)
  throw Error(
    "Scoped acceptance requires the isolated scoped QA profile and port 48489.",
  );
const client = new Client({
  name: "Sugar Maple scoped acceptance",
  version: "1",
});
await client.connect(
  new StreamableHTTPClientTransport(new URL(mcpEndpoint), {
    requestInit: {
      headers: {
        Authorization: `Bearer ${(await Bun.file(tokenFile).text()).trim()}`,
      },
    },
  }),
);
async function call(name: string, args: any = {}, peer = client) {
  const result: any = await peer.callTool({ name, arguments: args });
  assert.equal(
    result.isError ?? false,
    false,
    JSON.stringify(result.structuredContent),
  );
  return result.structuredContent;
}
const baseline = `${supportDirectory}/scoped-baseline.json`;
const target = (d: any) => ({
  documentId: d.documentId,
  expectedRevision: d.revision,
});
async function error(name: string, args: any, code: string) {
  const result: any = await client.callTool({ name, arguments: args });
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.error.code, code);
}
try {
  const listed = await client.listTools();
  assert.ok(listed.tools.some((t) => t.name === "editor.discover"));
  assert.ok(listed.tools.some((t) => t.name === "document.read"));
  if (process.argv.includes("--setup")) {
    await call("document.new", { name: "Scoped MCP QA" });
    const d = await call("document.get"),
      pageId = d.document.pages[0].id;
    await call("transaction.apply", {
      ...target(d),
      requestId: crypto.randomUUID(),
      operations: [
        {
          type: "node.add",
          node: {
            id: "board",
            kind: "artboard",
            pageId,
            name: "Read fixture",
            width: 320,
            height: 240,
            fill: "#e06030",
          },
        },
        {
          type: "node.add",
          node: {
            id: "child",
            parentId: "board",
            kind: "text",
            pageId,
            name: "Read label",
            text: "Authoritative text",
            width: 200,
            height: 44,
          },
        },
      ],
    });
    await call("selection.set", { id: "child" });
    await call("viewport.fit");
    await Bun.write(
      baseline,
      JSON.stringify(await call("document.checkpoint")),
    );
    console.log(
      "PASS: scoped tools discovered via real SDK; durable owned fixture ready for human keyboard edit.",
    );
  } else if (process.argv.includes("--verify-human")) {
    const before = await Bun.file(baseline).json(),
      d = await call("document.get");
    assert.ok(d.revision > before.journal.length);
    const slice = await call("document.read", {
      ...target(d),
      scope: "selection",
    });
    assert.deepEqual(slice.nodes, [
      d.document.nodes.find((n: any) => n.id === "child"),
    ]);
    await error(
      "document.read",
      {
        documentId: d.documentId,
        expectedRevision: before.journal.length,
        scope: "document",
      },
      "stale_revision",
    );
    await call("history.undo", target(d));
    const undone = await call("document.get");
    assert.deepEqual(
      (
        await call("document.read", {
          ...target(undone),
          scope: "subtree",
          nodeId: "child",
        })
      ).nodes,
      [before.document.nodes.find((n: any) => n.id === "child")],
    );
    await Bun.write(
      baseline,
      JSON.stringify(await call("document.checkpoint")),
    );
    console.log(
      "PASS: scoped native reads match the authored human keyboard edit; stale targeting rejects and undo restores exact prior values.",
    );
  } else if (process.argv.includes("--scale")) {
    const first = await call("document.get");
    await call("transaction.apply", {
      ...target(first),
      requestId: crypto.randomUUID(),
      operations: [{ type: "node.remove", id: "board" }],
    });
    const metrics: any[] = [];
    for (const count of [1000, 10000]) {
      let d = await call("editor.discover"),
        existing = d.nodeCount,
        pageId = d.pageId;
      const operations: any[] = [];
      for (let i = existing; i < count; i++) {
        const group = Math.floor(i / 100),
          cell = i % 100;
        operations.push({
          type: "node.add",
          node: {
            id: `n${i}`,
            pageId,
            kind: cell ? "text" : "frame",
            name: `Node ${i}`,
            parentId: cell ? `n${group * 100}` : null,
            order: cell ? cell : group,
            hidden: cell === 0,
            text: cell ? `Cell ${i}` : "",
            width: 10,
            height: 10,
          },
        });
      }
      for (let offset = 0; offset < operations.length; offset += 500) {
        d = await call("editor.discover");
        await call("transaction.apply", {
          ...target(d),
          requestId: crypto.randomUUID(),
          operations: operations.slice(offset, offset + 500),
        });
      }
      d = await call("editor.discover");
      assert.equal(d.nodeCount, count);
      let started = performance.now();
      const all = await call("document.get");
      const fullMs = performance.now() - started;
      started = performance.now();
      const slice = await call("document.read", {
        ...target(d),
        scope: "subtree",
        nodeId: "n0",
        limit: 100,
      });
      const scopedMs = performance.now() - started;
      assert.equal(slice.nodes.length, 100);
      assert.deepEqual(
        slice.nodes,
        all.document.nodes
          .filter((n: any) => n.id === "n0" || n.parentId === "n0")
          .sort((a: any, b: any) =>
            a.parentId === null
              ? -1
              : b.parentId === null
                ? 1
                : a.order - b.order,
          ),
      );
      const measurements = [];
      for (let i = 0; i < 10; i++) {
        started = performance.now();
        await call("document.read", {
          ...target(d),
          scope: "subtree",
          nodeId: "n0",
          limit: 100,
        });
        measurements.push(performance.now() - started);
      }
      measurements.sort((a, b) => a - b);
      metrics.push({
        nodes: count,
        fullMs,
        fullBytes: Buffer.byteLength(JSON.stringify(all)),
        scopedMs,
        scopedBytes: Buffer.byteLength(JSON.stringify(slice)),
        warmP95Ms: measurements[9],
      });
      const seen: string[] = [];
      for (let offset = 0; offset < count; offset += 500) {
        const part = await call("document.read", {
          ...target(d),
          scope: "page",
          pageId,
          offset,
          limit: 500,
        });
        seen.push(...part.nodes.map((n: any) => n.id));
        assert.equal(part.total, count);
      }
      assert.equal(new Set(seen).size, count);
    }
    await Bun.write(
      "build/evidence/scoped-native-metrics.json",
      JSON.stringify(metrics, null, 2),
    );
    console.log(JSON.stringify(metrics));
  } else {
    const d = await call("editor.discover"),
      original = await call("document.checkpoint");
    const input = { ...target(d), scope: "subtree", nodeId: "board", limit: 1 };
    const read = await call("document.read", input);
    assert.equal(read.total, 2);
    assert.equal(read.nextOffset, 1);
    await error(
      "document.read",
      { ...target(d), scope: "subtree", nodeId: "missing" },
      "not_found",
    );
    await error(
      "document.read",
      { ...target(d), scope: "document", documentId: "wrong" },
      "wrong_document",
    );
    await error(
      "render.capture",
      { ...target(d), rect: { x: 100000, y: 0, width: 1, height: 1 } },
      "invalid_input",
    );
    await Bun.sleep(110);
    await error("render.capture", { ...target(d), scale: 3 }, "invalid_input");
    for (const [name, extra] of [
      ["full", {}],
      ["crop", { rect: { x: 400, y: 200, width: 240, height: 160 } }],
      [
        "crop2x",
        { rect: { x: 400, y: 200, width: 240, height: 160 }, scale: 2 },
      ],
    ] as const) {
      await Bun.sleep(110);
      const result: any = await client.callTool({
        name: "render.capture",
        arguments: { ...target(d), ...extra },
      });
      assert.equal(
        result.isError ?? false,
        false,
        JSON.stringify(result.structuredContent),
      );
      const png = Buffer.from(
          result.content.find((c: any) => c.type === "image").data,
          "base64",
        ),
        meta = result.structuredContent.capture;
      assert.equal(png.readUInt32BE(16), meta.pixelWidth);
      assert.equal(png.readUInt32BE(20), meta.pixelHeight);
      if (name !== "full") {
        assert.equal(meta.pixelWidth, name === "crop" ? 240 : 480);
        assert.equal(meta.pixelHeight, name === "crop" ? 160 : 320);
      }
      await Bun.write(`build/evidence/scoped-${name}.png`, png);
    }
    const stdio = new Client({
      name: "Sugar Maple scoped stdio acceptance",
      version: "1",
    });
    try {
      await stdio.connect(
        new StdioClientTransport({
          command: process.execPath,
          args: ["tools/mcp-stdio.ts"],
          env: { ...(process.env as Record<string, string>) },
        }),
      );
      assert.deepEqual(await call("document.read", input, stdio), read);
    } finally {
      await stdio.close();
    }
    assert.deepEqual(await call("document.checkpoint"), original);
    console.log(
      "PASS: real HTTP/stdio scoped results match; unknown/stale targets and invalid crops reject; exact crop/2x PNG dimensions and nonmutating reads/captures verified.",
    );
  }
} finally {
  await client.close();
}
