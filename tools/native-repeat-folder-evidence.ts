// Read-only evidence for the held owned DEBUG Repeat QA app.
// Perform the real NSOpenPanel/Mapping/Preview/Apply/Cmd+Z actions through native UI.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { strict as assert } from "node:assert";
import { DocumentStore } from "../src/web/src/app/model/store";
import { repeatCells } from "../src/web/src/app/model/repeat";
import { subtree } from "../src/web/src/app/model/composition";
import { embeddedAsset } from "../src/web/src/app/model/assets";
import { pixel } from "./repeat-fixture";
const folder = resolve("build/repeat-drops/native-human"),
  stage = process.argv[2];
if (
  ![
    "prepare",
    "before",
    "staged",
    "preview",
    "apply",
    "undo",
    "verify",
  ].includes(stage)
)
  throw Error("Choose prepare, before, staged, preview, apply, undo or verify");
mkdirSync(folder, { recursive: true });
if (stage === "prepare") {
  const images = resolve("build/repeat-drops/native-images");
  mkdirSync(images, { recursive: true });
  const second =
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAK0lEQVR4nGNQTX79HxmjA0LyDMPAAFI1oMsPBwMGPhYG3gBSNQzCaKTUAABYeTcur975JwAAAABJRU5ErkJggg==";
  await Bun.write(
    resolve(images, "01.png"),
    Buffer.from(pixel.split(",")[1], "base64"),
  );
  await Bun.write(resolve(images, "02.png"), Buffer.from(second, "base64"));
  await Bun.write(resolve(images, ".DS_Store"), "Owned metadata fixture");
  console.log(
    "Prepared two known PNGs and metadata in the owned native-images fixture folder",
  );
  process.exit(0);
}
if (stage === "verify") {
  await verifyFolder();
  process.exit(0);
}
const owner = await Bun.file(
  resolve("build/repeat-handles-mcp/interactive-state.json"),
).json();
assert.equal(owner.identifier, "io.zubair.sugarmaple.repeat-qa");
assert.equal(owner.port, 48494);
const client = new Client({
  name: "Owned Repeat Grid real UI evidence",
  version: "1",
});
await client.connect(
  new StreamableHTTPClientTransport(new URL("http://127.0.0.1:48494/mcp"), {
    requestInit: {
      headers: {
        Authorization:
          "Bearer " +
          (
            await Bun.file(
              resolve("build/repeat-handles-mcp/profile/mcp-token"),
            ).text()
          ).trim(),
      },
    },
  }),
);
try {
  async function data(name: string, args: any = {}) {
    const response: any = await client.callTool({ name, arguments: args });
    if (response.isError)
      throw Error(JSON.stringify(response.structuredContent));
    return response;
  }
  const checkpoint = (await data("document.checkpoint")).structuredContent;
  let d = (await data("document.get")).structuredContent;
  const deadline = Date.now() + 10000;
  while (!d.durable) {
    if (Date.now() > deadline)
      throw Error("Owned document did not become durable");
    await Bun.sleep(50);
    d = (await data("document.get")).structuredContent;
  }
  assert.equal(
    d.documentId,
    owner.document.documentId,
    "Only read the held owned QA document",
  );
  const capture = await data("render.capture", {
    documentId: d.documentId,
    expectedRevision: d.revision,
    scale: 1,
  });
  await Bun.write(
    resolve(folder, "human-" + stage + ".json"),
    JSON.stringify(checkpoint, null, 2),
  );
  const png = capture.content.find((x: any) => x.type === "image");
  await Bun.write(
    resolve(folder, "human-" + stage + ".png"),
    Buffer.from(png.data, "base64"),
  );
  const grid = checkpoint.document.nodes.find((n: any) => n.repeatTemplateId),
    cells = checkpoint.document.nodes.filter(
      (n: any) => n.parentId === grid.id && n.repeatIndex !== null,
    );
  console.log(
    JSON.stringify({
      stage,
      revision: d.revision,
      columns: grid.columns,
      gap: grid.gap,
      cells: cells.length,
      journal: checkpoint.journal.length,
      origin: checkpoint.journal.at(-1)?.origin,
    }),
  );
} finally {
  await client.close();
}

async function verifyFolder() {
  const read = async (stage: string) =>
    await Bun.file(resolve(folder, "human-" + stage + ".json")).json();
  const before = await read("before"),
    staged = await read("staged"),
    preview = await read("preview"),
    applied = await read("apply"),
    undo = await read("undo");
  assert.deepEqual(
    staged,
    before,
    "Real folder choice and field mapping must not mutate checkpoint",
  );
  assert.deepEqual(preview, before, "Preview must not mutate checkpoint");
  assert.equal(
    DocumentStore.fromCheckpoint(applied).revision,
    DocumentStore.fromCheckpoint(before).revision + 1,
  );
  assert.equal(applied.journal.length, before.journal.length + 1);
  const entry = applied.journal.at(-1);
  assert.equal(entry.origin, "human");
  const operations = JSON.parse(entry.signature).operations;
  assert.equal(
    operations.filter((o: any) => o.type === "repeat.import").length,
    1,
  );
  assert.ok(
    operations.every(
      (o: any) => o.type === "asset.set" || o.type === "repeat.import",
    ),
  );
  const grid = before.document.nodes.find((n: any) => n.repeatTemplateId),
    cells = repeatCells(before.document, grid.id),
    next = repeatCells(applied.document, grid.id);
  assert.deepEqual(
    next.map((n) => n.id),
    cells.map((n) => n.id),
  );
  assert.deepEqual(
    applied.document.nodes.find((n: any) => n.id === grid.id),
    grid,
  );
  for (let i = 0; i < cells.length; i++) {
    const oldTree = subtree(before.document, cells[i].id),
      newTree = subtree(applied.document, next[i].id);
    const photo = newTree.find((n) => n.kind === "image")!;
    if (i < 2) {
      const bytes = await Bun.file(
        "build/repeat-drops/native-images/" + (i === 0 ? "01.png" : "02.png"),
      ).arrayBuffer();
      const asset = embeddedAsset(
        "data:image/png;base64," + Buffer.from(bytes).toString("base64"),
      );
      assert.equal(photo.asset, "asset:" + asset.key);
      assert.equal(applied.document.assets[asset.key], asset.source);
      for (const n of oldTree)
        if (n.kind !== "image")
          assert.deepEqual(
            newTree.find((x) => x.id === n.id),
            n,
            "Unmapped data must remain unchanged",
          );
    } else
      assert.deepEqual(
        newTree,
        oldTree,
        "Cells beyond source rows must remain unchanged",
      );
  }
  assert.notEqual(
    subtree(applied.document, cells[1].id).find((n) => n.kind === "image")!
      .asset,
    subtree(before.document, cells[1].id).find((n) => n.kind === "image")!
      .asset,
    "Second selected image must visibly change",
  );
  assert.deepEqual(
    undo.document,
    before.document,
    "OS Cmd+Z must restore exact document including assets",
  );
  await Bun.write(
    resolve(folder, "report.json"),
    JSON.stringify(
      {
        passed: true,
        checks: 1,
        method:
          "Actual owned DEBUG app, real NSOpenPanel folder selection via macOS CUA, explicit Photo mapping/Preview/Apply/Cmd+Z; authenticated HTTP MCP read and revision-bound rendered capture at each stage, waiting for durable state",
        assertions: [
          "Filename order 01.png then 02.png",
          "Choice/mapping/preview preserve checkpoint",
          "Apply increments revision once with one human journal batch",
          "Two correctly embedded assets; second image visibly changes",
          "Grid geometry, stable cell IDs and unmapped values retained",
          "Cells after data rows unchanged",
          "Cmd+Z restores exact document including assets",
        ],
        limitations: [
          "Directory drag entry traversal is separately tested with fixtures",
          "No full VoiceOver audit or physical input latency measurement",
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: actual OS folder chooser/mapping/apply, one human batch, durable assets, unchanged grid/data and exact Cmd+Z undo",
  );
}
