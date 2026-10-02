import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { strict as assert } from "node:assert";
import { supportDirectory, tokenFile, mcpEndpoint } from "./mcp-config";
import {
  libraryFixture,
  webAwesomeManifest as manifest,
} from "./library-fixture";
import { libraryKey } from "../src/web/src/app/model/library-schema";
import { DocumentStore } from "../src/web/src/app/model/store";
import {
  editablePayload,
  pasteElements,
} from "../src/web/src/app/model/clipboard";
if (
  !supportDirectory.endsWith("/build/library-qa/profile") ||
  process.env["SUGAR_MAPLE_MCP_PORT"] !== "48492" ||
  tokenFile !== supportDirectory + "/mcp-token"
)
  throw Error("Library acceptance requires its owned profile and port 48492");
const client = new Client({
  name: "Sugar Maple library native acceptance",
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
  const response = await result(name, args);
  if (response.isError) throw Error(JSON.stringify(response));
  return response.structuredContent;
}
async function tx(operations: any[]) {
  const d = await call("document.get");
  return {
    documentId: d.documentId,
    expectedRevision: d.revision,
    requestId: crypto.randomUUID(),
    operations,
  };
}
async function reject(operations: any[]) {
  const before = await call("document.checkpoint"),
    response = await result("transaction.apply", await tx(operations));
  assert.equal(response.isError, true);
  assert.deepEqual(await call("document.checkpoint"), before);
}
async function durable() {
  const deadline = Date.now() + 10000;
  while (!(await call("document.get")).durable) {
    if (Date.now() > deadline)
      throw Error("Native library autosave did not become durable");
    await Bun.sleep(50);
  }
}
const baseline = supportDirectory + "/library-baseline.json",
  key = libraryKey(manifest);
try {
  if (process.argv.includes("--verify-reset")) {
    const resetBaseline = supportDirectory + "/library-reset-baseline.json";
    assert.deepEqual(
      await call("document.checkpoint"),
      await Bun.file(resetBaseline).json(),
    );
    assert.equal((await call("document.get")).durable, true);
    await Bun.write(
      "build/evidence/library-reset-native-reopened.json",
      JSON.stringify(await call("document.checkpoint"), null, 2),
    );
    console.log(
      "PASS: real native restart preserves the exact reset checkpoint and undo journal",
    );
  } else if (process.argv.includes("--reset")) {
    await call("document.new", { name: "Library reset native QA" });
    const d = await call("document.get");
    await call(
      "transaction.apply",
      await tx([
        { type: "library.import", manifest },
        {
          type: "library.insert",
          key,
          component: "Button",
          id: "reset-button",
          pageId: d.document.pages[0].id,
          x: 40,
          y: 40,
          props: { label: "Reset fixture" },
        },
        { type: "token.set", name: "brand.primary", value: "#763cba" },
        {
          type: "node.update",
          id: "reset-button",
          patch: { color: "#ffff00", fillToken: "brand.primary", radius: 13 },
        },
      ]),
    );
    await call("selection.set", { id: "reset-button" });
    await call("viewport.fit");
    const before = await call("document.checkpoint");
    async function capture(name: string) {
      await Bun.sleep(110); // Respect the native revision-bound capture rate limit.
      const target = await call("document.get"),
        response = await result("render.capture", {
          documentId: target.documentId,
          expectedRevision: target.revision,
        });
      assert.equal(response.isError ?? false, false);
      const image = response.content.find((c: any) => c.type === "image");
      assert.ok(image);
      await Bun.write(
        `build/evidence/library-reset-native-${name}.png`,
        Buffer.from(image.data, "base64"),
      );
    }
    await capture("before");
    await call(
      "transaction.apply",
      await tx([{ type: "library.reset", id: "reset-button" }]),
    );
    const reset = await call("document.checkpoint"),
      node = reset.document.nodes.find((n: any) => n.id === "reset-button");
    assert.equal(reset.journal.length, before.journal.length + 1);
    assert.equal(node.color, "#18181b");
    assert.equal(node.fill, "#ffffff");
    assert.equal(node.fillToken, "");
    assert.equal(node.radius, 0);
    assert.deepEqual(node.libraryRef.localOverrides, []);
    assert.equal(node.libraryRef.variant, "Default");
    assert.deepEqual(reset.document.tokens, before.document.tokens);
    for (const field of [
      "id",
      "x",
      "y",
      "width",
      "height",
      "rotation",
      "librarySlot",
    ])
      assert.equal(
        node[field],
        before.document.nodes.find((n: any) => n.id === node.id)[field],
      );
    await capture("reset");
    const target = await call("document.get");
    await call("history.undo", {
      documentId: target.documentId,
      expectedRevision: target.revision,
    });
    assert.deepEqual((await call("document.get")).document, before.document);
    await capture("undo");
    const undone = await call("document.get");
    await call("history.redo", {
      documentId: undone.documentId,
      expectedRevision: undone.revision,
    });
    assert.deepEqual((await call("document.get")).document, reset.document);
    await capture("redo");
    await durable();
    const final = await call("document.checkpoint");
    assert.deepEqual(
      DocumentStore.fromCheckpoint(final).document,
      final.document,
    );
    await Bun.write(
      supportDirectory + "/library-reset-baseline.json",
      JSON.stringify(final),
    );
    await Bun.write(
      "build/evidence/library-reset-native-report.json",
      JSON.stringify(
        {
          passed: true,
          before,
          reset,
          final,
          checks: [
            "real authenticated MCP reset command",
            "one atomic undo step",
            "source/default paint and cleared fill token",
            "preserved tokens/variant/geometry",
            "exact native undo/redo",
            "complete checkpoint replay",
            "actual native revision-bound render captures",
            "durable autosave",
          ],
          remaining: [
            "verify exact checkpoint after native process restart",
            "exact-head review/CI and resulting main",
          ],
        },
        null,
        2,
      ),
    );
    console.log(
      "PASS: real native MCP reset restores semantic paint in one command, exact undo/redo, revision-bound captures and durable replay",
    );
  } else if (process.argv.includes("--verify")) {
    assert.deepEqual(
      await call("document.checkpoint"),
      await Bun.file(baseline).json(),
    );
    assert.equal((await call("document.get")).durable, true);
    console.log(
      "PASS: actual native checkpoint and complete undo journal retain pinned library identities/props/slots/dependencies across preview/cancel/restart",
    );
  } else if (process.argv.includes("--verify-import")) {
    const previous = await Bun.file(baseline).json(),
      current = await call("document.checkpoint");
    assert.equal(current.journal.length, previous.journal.length + 1);
    assert.equal(Object.keys(current.document.libraries).length, 2);
    assert.deepEqual(current.document.nodes, previous.document.nodes);
    assert.deepEqual(
      DocumentStore.fromCheckpoint(current).document,
      current.document,
    );
    const d = await call("document.get");
    await call("history.undo", {
      documentId: d.documentId,
      expectedRevision: d.revision,
    });
    assert.deepEqual((await call("document.get")).document, previous.document);
    const u = await call("document.get");
    await call("history.redo", {
      documentId: u.documentId,
      expectedRevision: u.revision,
    });
    assert.deepEqual((await call("document.get")).document, current.document);
    await durable();
    await Bun.write(
      baseline,
      JSON.stringify(await call("document.checkpoint")),
    );
    console.log(
      "PASS: actual native manifest file import applies as one batch, preserves existing node identity/props and replays through undo/redo and durable autosave",
    );
  } else {
    await call("document.new", { name: "Library native QA" });
    const d = await call("document.get"),
      fixture = libraryFixture();
    await call(
      "transaction.apply",
      await tx([
        { type: "library.import", manifest },
        ...fixture.document.nodes.map((node) => ({
          type: "node.add",
          node: { ...node, pageId: d.document.pages[0].id },
        })),
      ]),
    );
    await reject([
      { type: "document.rename", name: "Partial" },
      { type: "library.props", id: "button", props: { disabled: "false" } },
    ]);
    const bad = structuredClone(manifest);
    bad.components.Button.props.disabled.webAttribute = "onclick";
    await reject([{ type: "library.import", manifest: bad }]);
    await call(
      "transaction.apply",
      await tx([
        {
          type: "node.update",
          id: "button",
          patch: { text: "Native local override" },
        },
        {
          type: "library.props",
          id: "button",
          props: { label: "Source label" },
          variant: "Disabled",
        },
      ]),
    );
    const current = await call("document.get");
    assert.equal(
      current.document.nodes.find((n: any) => n.id === "button").text,
      "Native local override",
    );
    assert.equal(
      current.document.nodes.find((n: any) => n.id === "button").disabled,
      true,
    );
    const scoped = await call("document.read", {
      scope: "subtree",
      nodeId: "root",
      documentId: current.documentId,
      expectedRevision: current.revision,
    });
    assert.deepEqual(scoped.references.libraries, { [key]: manifest });
    const web = await call("code.export", {
        id: "root",
        target: "web-library",
      }),
      swift = await call("code.export", {
        id: "root",
        target: "swift-library",
      });
    assert.ok(web.code.includes("wa-button"));
    assert.ok(swift.code.includes('Button("Native local override")'));
    const source = current.document,
      payload = editablePayload(source, "root");
    await call("document.new", { name: "Library native paste QA" });
    const target = await call("document.get"),
      paste = pasteElements(
        target.document,
        target.document.pages[0].id,
        JSON.stringify(payload),
      );
    await call("transaction.apply", await tx(paste.operations));
    const pasted = await call("document.get");
    assert.deepEqual(pasted.document.libraries, source.libraries);
    const button = pasted.document.nodes.find(
      (n: any) => n.libraryRef?.component === "Button",
    );
    assert.equal(button.text, "Native local override");
    assert.equal(button.libraryRef.variant, "Disabled");
    await call("selection.set", { id: button.id });
    await call("viewport.fit");
    await durable();
    await Bun.write(
      baseline,
      JSON.stringify(await call("document.checkpoint")),
    );
    console.log(
      "PASS: actual native SDK validates atomic library rejection, source props/local overrides, scoped dependencies, mapped targets and cross-document clipboard identity before durable autosave",
    );
  }
} finally {
  await client.close();
}
