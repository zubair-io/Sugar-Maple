import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { strict as assert } from "node:assert";
import { flatten, project } from "../src/web/src/app/canvas/scene-layout";
// Own a separate DEBUG bundle/profile/port. Never connect to the user's editor.
const root = resolve(import.meta.dir, ".."),
  locks = process.argv.includes('--locks'),
  hold = process.argv.includes('--hold'),
  output = resolve(root, locks ? "build/canvas-lock-mcp" : "build/canvas-transform-mcp");
const app = resolve(output, locks ? "Sugar Maple Lock QA.app" : "Sugar Maple Transform QA.app"),
  profile = resolve(output, "profile");
const port = 48494,
  identifier = locks ? "io.zubair.sugarmaple.lock-qa" : "io.zubair.sugarmaple.transform-qa";
mkdirSync(profile, { recursive: true });
async function command(cmd: string[]) {
  const child = Bun.spawn(cmd, { cwd: root, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (await child.exited) throw Error(`${cmd[0]} failed: ${stderr}`);
  return stdout.trim();
}
const available = Bun.listen({
  hostname: "127.0.0.1",
  port,
  socket: { data() {} },
});
available.stop(true);
await command([
  "ditto",
  resolve(root, "build/DerivedData/Build/Products/Debug/Sugar Maple.app"),
  app,
]);
const plist = resolve(app, "Contents/Info.plist");
for (const [key, type, value] of [
  ["CFBundleIdentifier", "string", identifier],
  ["CFBundleName", "string", "Sugar Maple Transform QA"],
  ["SugarMapleTestSupport", "string", profile],
  ["SugarMapleTestPort", "integer", String(port)],
])
  await command(["plutil", "-replace", key, "-" + type, value, plist]);
await command(["codesign", "--force", "--deep", "--sign", "-", app]);
const executable = await command([
  "plutil",
  "-extract",
  "CFBundleExecutable",
  "raw",
  plist,
]);
const owner = Bun.spawn([resolve(app, "Contents/MacOS", executable)], {
  cwd: root,
  stdout: Bun.file(resolve(output, "native-owner.log")),
  stderr: Bun.file(resolve(output, "native-owner-error.log")),
});
const client = new Client({
  name: "Sugar Maple isolated transform QA",
  version: "1",
});
let connected = false;
async function call(name: string, args: any = {}) {
  const response: any = await client.callTool({ name, arguments: args });
  assert.equal(
    response.isError ?? false,
    false,
    JSON.stringify(response.structuredContent),
  );
  return response;
}
const data = async (name: string, args: any = {}) =>
  (await call(name, args)).structuredContent;
async function tx(operations: any[]) {
  const d = await data("document.get");
  return data("transaction.apply", {
    documentId: d.documentId,
    expectedRevision: d.revision,
    requestId: crypto.randomUUID(),
    operations,
  });
}
try {
  const deadline = Date.now() + 30000;
  let listening = false;
  while (!listening) {
    if (Date.now() > deadline || owner.exitCode !== null)
      throw Error("Owned native MCP did not start");
    if (await Bun.file(resolve(profile, "mcp-token")).exists()) {
      try {
        // A retained profile can already have a token. Wait for this owned
        // process's listener before opening the authenticated SDK transport.
        listening =
          (
            await fetch(`http://127.0.0.1:${port}/mcp`, {
              signal: AbortSignal.timeout(500),
            })
          ).status === 401;
      } catch {
        /* Same live owner: continue observing startup. */
      }
    }
    if (listening) break;
    await Bun.sleep(100);
  }
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://127.0.0.1:${port}/mcp`),
    {
      requestInit: {
        headers: {
          Authorization: `Bearer ${(await Bun.file(resolve(profile, "mcp-token")).text()).trim()}`,
        },
      },
    },
  );
  await client.connect(transport);
  connected = true;
  while (true) {
    const ready: any = await client.callTool({
      name: "document.get",
      arguments: {},
    });
    if (!ready.isError) break;
    if (Date.now() > deadline) throw Error("Owned editor not ready");
    await Bun.sleep(100);
  }
  await data("document.new", { name: "Owned Canvas transform MCP QA" });
  const d = await data("document.get"),
    pageId = d.document.pages[0].id;
  await tx([
    {
      type: "node.add",
      node: {
        id: "parent",
        name: "Rotated parent",
        pageId,
        kind: "frame",
        x: 40,
        y: 40,
        width: 500,
        height: 450,
        rotation: 35,
        strokeWidth: 2,
        locked: locks,
      },
    },
    {
      type: "node.add",
      node: {
        id: "child",
        name: "Rotated child",
        pageId,
        parentId: "parent",
        kind: "rectangle",
        x: 140,
        y: 160,
        width: 160,
        height: 90,
        rotation: 30,
        fill: "#2563eb",
      },
    },
  ]);
  await data("selection.set", { id: "child" });
  async function geometry() {
    const camera = await data("viewport.fit"),
      d = await data("document.get"),
      actual = await data("layout.inspect");
    for (const item of flatten(project(d.document, pageId))) {
      const bounds = actual.nodes.find(
        (n: any) => n.id === item.node.id,
      ).bounds;
      assert.ok(bounds);
      const expected = {
        x: actual.viewport.x + camera.pan.x + item.bounds.x * camera.zoom,
        y: actual.viewport.y + camera.pan.y + item.bounds.y * camera.zoom,
        width: item.bounds.width * camera.zoom,
        height: item.bounds.height * camera.zoom,
      };
      for (const key of ["x", "y", "width", "height"] as const)
        assert.ok(Math.abs(bounds[key] - expected[key]) < 1e-6, key);
    }
    return actual;
  }
  await geometry();
  const before = await data("document.get");
  await tx([
    {
      type: "node.update",
      id: "child",
      patch: { x: 125, y: 151, width: 210, height: 120, rotation: 145 },
    },
  ]);
  const after = await data("document.get");
  assert.equal(after.revision, before.revision + 1);
  await geometry();
  await data("history.undo", {
    documentId: after.documentId,
    expectedRevision: after.revision,
  });
  const undone = await data("document.get");
  assert.deepEqual(undone.document, before.document);
  await data("history.redo", {
    documentId: undone.documentId,
    expectedRevision: undone.revision,
  });
  assert.deepEqual((await data("document.get")).document, after.document);
  await geometry();
  const current = await data("document.get"),
    capture = await call("render.capture", {
      documentId: current.documentId,
      expectedRevision: current.revision,
      scale: 1,
    });
  const png = capture.content.find((item: any) => item.type === "image");
  assert.ok(png);
  await Bun.write(
    resolve(output, "native-mcp.png"),
    Buffer.from(png.data, "base64"),
  );
  while (!(await data("document.get")).durable) {
    if (Date.now() > deadline)
      throw Error("Owned native checkpoint did not become durable");
    await Bun.sleep(50);
  }
  await Bun.write(
    resolve(output, "checkpoint.json"),
    JSON.stringify(await data("document.checkpoint")),
  );
  await Bun.write(
    resolve(output, "report.json"),
    JSON.stringify(
      {
        passed: true,
        port,
        identifier,
        scope:
          locks ? "Actual native HTTP MCP SDK explicit editing through a locked ancestor, exact atomic undo/redo, transformed capture and durable checkpoint. Direct human guards are tested separately." : "Actual native HTTP MCP SDK, transformed layout/selection/capture, atomic authoring undo/redo and durable native checkpoint. Human pointer gestures are tested separately in Chrome.",
        capture: capture.structuredContent.capture,
      },
      null,
      2,
    ),
  );
  console.log(
    locks ? "PASS: actual isolated native MCP explicit editing with a locked ancestor, exact undo/redo and durable capture/checkpoint" : "PASS: actual isolated native Sugar Maple MCP on 48494, nested transformed Canvas layout, selection/capture, exact atomic undo/redo and durable checkpoint",
  );
  if (hold) {
    await Bun.write(resolve(output, 'interactive-state.json'), JSON.stringify({ app, profile, port, identifier,
      document: await data('document.get'), layout: await data('layout.inspect') }));
    console.log('Owned app ready for native UI acceptance. Send a newline to finish and stop only this owner.');
    await new Promise<void>(resolve => process.stdin.once('data', () => resolve()));
  }
} finally {
  if (connected) await client.close();
  owner.kill("SIGTERM");
  await owner.exited;
}
