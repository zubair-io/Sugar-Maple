import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { strict as assert } from "node:assert";
import { supportDirectory, tokenFile, mcpEndpoint } from "./mcp-config";
import { repeatFixture, pixel } from "./repeat-fixture";
import { repeatCells, repeatTargets } from "../src/web/src/app/model/repeat";
import { embeddedAsset } from "../src/web/src/app/model/assets";
import { DocumentStore } from "../src/web/src/app/model/store";
import {
  parseRepeatData,
  repeatImportOperations,
} from "../src/web/src/app/model/repeat-data";
if (
  !supportDirectory.endsWith("/build/repeat-qa/profile") ||
  process.env["SUGAR_MAPLE_MCP_PORT"] !== "48491" ||
  tokenFile !== supportDirectory + "/mcp-token"
)
  throw Error(
    "Repeat Grid acceptance requires its owned QA profile and port 48491",
  );
const client = new Client({
  name: "Sugar Maple Repeat Grid native acceptance",
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
async function result(name: string, args: any = {}) {
  return (await client.callTool({ name, arguments: args })) as any;
}
async function call(name: string, args: any = {}) {
  const r = await result(name, args);
  if (r.isError) throw Error(JSON.stringify(r));
  return r.structuredContent;
}
async function transaction(operations: any[]) {
  const d = await call("document.get");
  return {
    documentId: d.documentId,
    expectedRevision: d.revision,
    requestId: crypto.randomUUID(),
    operations,
  };
}
async function rejection(operations: any[]) {
  const before = await call("document.checkpoint");
  const response = await result(
    "transaction.apply",
    await transaction(operations),
  );
  assert.equal(response.isError, true);
  assert.deepEqual(await call("document.checkpoint"), before);
  return response;
}
const baseline = supportDirectory + "/repeat-baseline.json";
try {
  if (process.argv.includes("--select")) {
    const d = await call("document.get");
    const grid = d.document.nodes.find((n: any) => n.repeatTemplateId);
    assert.ok(grid);
    await call("selection.set", { id: grid.id });
    await call("viewport.fit");
  } else if (process.argv.includes("--verify-ui-files")) {
    const previous = await Bun.file(baseline).json(),
      current = await call("document.checkpoint");
    assert.equal(current.journal.length, previous.journal.length + 1);
    assert.equal(
      current.document.nodes.find((n: any) => n.id === "title").text,
      "Native file first",
    );
    assert.equal(
      current.document.nodes.find((n: any) => n.id === "email").initialValue,
      "file-first@example.test",
    );
    const shared = embeddedAsset(pixel),
      images = current.document.nodes.filter(
        (n: any) => n.kind === "image" && n.asset,
      );
    assert.equal(images.length, 2);
    assert.ok(images.every((n: any) => n.asset === shared.reference));
    assert.equal(current.document.assets[shared.key], pixel);
    assert.deepEqual(
      DocumentStore.fromCheckpoint(current).document,
      current.document,
    );
    let d = await call("document.get");
    await call("history.undo", {
      documentId: d.documentId,
      expectedRevision: d.revision,
    });
    assert.deepEqual((await call("document.get")).document, previous.document);
    d = await call("document.get");
    await call("history.redo", {
      documentId: d.documentId,
      expectedRevision: d.revision,
    });
    assert.deepEqual((await call("document.get")).document, current.document);
    const latest = await call("document.get"),
      capture = await result("render.capture", {
        documentId: latest.documentId,
        expectedRevision: latest.revision,
      });
    assert.notEqual(capture.isError, true);
    assert.deepEqual(capture.structuredContent.assetDiagnostics, []);
    const png = capture.content.find((item: any) => item.type === "image");
    assert.ok(png);
    await Bun.write(
      `${supportDirectory}/../native-import-capture.png`,
      Buffer.from(png.data, "base64"),
    );
    for (let i = 0; i < 200; i++) {
      if ((await call("document.get")).durable) break;
      await Bun.sleep(50);
    }
    assert.equal((await call("document.get")).durable, true);
    await Bun.write(
      baseline,
      JSON.stringify(await call("document.checkpoint")),
    );
    console.log(
      "PASS: actual native CSV and PNG pickers load chosen bytes, preview stays read-only, one-batch text/image/input mapping; shared references, capture readiness, autosave, exact replay and undo/redo preserve data",
    );
  } else if (process.argv.includes("--verify-ui-import")) {
    const previous = await Bun.file(baseline).json(),
      current = await call("document.checkpoint");
    assert.equal(current.journal.length, previous.journal.length + 1);
    assert.equal(
      current.document.nodes.find((n: any) => n.id === "title").text,
      "Native UI first",
    );
    assert.deepEqual(current.document.assets, previous.document.assets);
    assert.deepEqual(
      DocumentStore.fromCheckpoint(current).document,
      current.document,
    );
    let d = await call("document.get");
    await call("history.undo", {
      documentId: d.documentId,
      expectedRevision: d.revision,
    });
    assert.deepEqual((await call("document.get")).document, previous.document);
    d = await call("document.get");
    await call("history.redo", {
      documentId: d.documentId,
      expectedRevision: d.revision,
    });
    assert.deepEqual((await call("document.get")).document, current.document);
    for (let i = 0; i < 200; i++) {
      if ((await call("document.get")).durable) break;
      await Bun.sleep(50);
    }
    assert.equal((await call("document.get")).durable, true);
    await Bun.write(
      baseline,
      JSON.stringify(await call("document.checkpoint")),
    );
    console.log(
      "PASS: actual native UI field mapping/preview/apply adds one undoable import; images retained; MCP undo/redo and full checkpoint replay preserve the intended data",
    );
  } else if (process.argv.includes("--verify")) {
    assert.deepEqual(
      await call("document.checkpoint"),
      await Bun.file(baseline).json(),
    );
    const d = await call("document.get");
    assert.equal(d.durable, true);
    assert.ok(Object.keys(d.document.assets).length >= 1);
    console.log(
      "PASS: complete authored checkpoint/undo journal and embedded images match the durable saved QA baseline",
    );
  } else {
    await call("document.new", { name: "Repeat Grid native QA" });
    const d = await call("document.get"),
      fixture = repeatFixture();
    await call(
      "transaction.apply",
      await transaction(
        fixture.store.document.nodes.map((node) => ({
          type: "node.add",
          node: { ...node, pageId: d.document.pages[0].id },
        })),
      ),
    );
    const current = await call("document.get"),
      targets = repeatTargets(current.document, fixture.grid),
      cells = repeatCells(current.document, fixture.grid);
    const fields = targets
      .filter((t) => t.property !== "text" || t.name === "Title")
      .map((t) => ({
        targetId: t.id,
        property: t.property,
        field: t.name.toLowerCase(),
      }));
    const data = parseRepeatData(
      "title,photo,email\nNative first,pixel.png,first@example.test\nNative second,pixel.png,second@example.test",
      "csv",
    );
    const operations = repeatImportOperations(
      fixture.grid,
      data,
      fields,
      { "pixel.png": pixel },
      "error",
      false,
    );
    const invalid = structuredClone(operations);
    (invalid.at(-1) as any).fields[0].field = "unknown";
    await rejection(invalid);
    const overflow = structuredClone(operations);
    (overflow.at(-1) as any).rows.push((overflow.at(-1) as any).rows[0]);
    await rejection(overflow);
    const corrupt =
      "data:image/png;base64," +
      Buffer.from(pixel.split(",")[1], "base64")
        .subarray(0, 33)
        .toString("base64");
    const bad = embeddedAsset(corrupt);
    const decoded = await rejection([
      { type: "document.rename", name: "Must not change" },
      { type: "asset.set", key: bad.key, source: corrupt },
    ]);
    assert.match(JSON.stringify(decoded), /could not be decoded/);
    const before = await call("document.checkpoint");
    await call("transaction.apply", await transaction(operations));
    const imported = await call("document.checkpoint");
    assert.equal(imported.journal.length, before.journal.length + 1);
    assert.equal(Object.keys(imported.document.assets).length, 1);
    await call(
      "transaction.apply",
      await transaction([
        { type: "repeat.resize", id: fixture.grid, rows: 2, columns: 2 },
      ]),
    );
    const grown = await call("document.get");
    assert.deepEqual(
      repeatCells(grown.document, fixture.grid)
        .slice(0, 2)
        .map((n) => n.id),
      cells.map((n) => n.id),
    );
    await call(
      "transaction.apply",
      await transaction([
        { type: "repeat.resize", id: fixture.grid, rows: 1, columns: 2 },
      ]),
    );
    let latest = await call("document.get");
    await call("history.undo", {
      documentId: latest.documentId,
      expectedRevision: latest.revision,
    });
    latest = await call("document.get");
    assert.equal(repeatCells(latest.document, fixture.grid).length, 4);
    await call("history.redo", {
      documentId: latest.documentId,
      expectedRevision: latest.revision,
    });
    latest = await call("document.get");
    assert.equal(
      latest.document.nodes.find((n: any) => n.id === "title").text,
      "Native first",
    );
    const scope = await call("document.read", {
      documentId: latest.documentId,
      expectedRevision: latest.revision,
      scope: "subtree",
      nodeId: fixture.grid,
      offset: 0,
      limit: 100,
    });
    assert.deepEqual(scope.references.assets, latest.document.assets);
    for (const target of ["html", "angular", "tailwind", "svg", "swiftui"]) {
      const a = await call("code.export", { id: fixture.grid, target }),
        b = await call("code.export", { id: fixture.grid, target });
      assert.equal(a.code, b.code);
      assert.ok(
        a.code.includes(target === "swiftui" ? pixel.split(",")[1] : pixel),
      );
    }
    await call("selection.set", { id: fixture.grid });
    await call("viewport.fit");
    const rendered = await call("render.capture", {
      documentId: latest.documentId,
      expectedRevision: latest.revision,
    });
    assert.deepEqual(rendered.assetDiagnostics, []);
    for (let i = 0; i < 200; i++) {
      const saved = await call("document.get");
      if (saved.durable) break;
      await Bun.sleep(50);
    }
    assert.equal((await call("document.get")).durable, true);
    await Bun.write(
      baseline,
      JSON.stringify(await call("document.checkpoint")),
    );
    await Bun.write(
      supportDirectory + "/repeat-grid.json",
      JSON.stringify({ grid: fixture.grid }),
    );
    console.log(
      "PASS: actual native MCP named text/image import; invalid fields/overflow/decoded corruption preserve whole history; one-batch shared assets, stable resize/undo/redo, bounded reads, deterministic web/SVG/SwiftUI exports and durable autosave",
    );
  }
} finally {
  await client.close();
}
