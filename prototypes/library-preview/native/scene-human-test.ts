import { strict as assert } from "node:assert";
import { buildNativeFixture } from "./build";
import { NativePreview, type NativeReply } from "./controller";
import { libraryFixture } from "../../../tools/library-fixture";
import { project } from "../../../src/web/src/app/canvas/scene-layout";
import { projectLibraryScene } from "../scene-contract";

if (!process.argv.includes("--trust-native-fixture"))
  throw Error("Explicit --trust-native-fixture required");
const build = await buildNativeFixture(true),
  store = libraryFixture(),
  original = store.document;
const events: NativeReply[] = [],
  records: any[] = [];
const native = new NativePreview(build, (event) => events.push(event));
const deadline = Date.now() + 55000;
const scene = () =>
  projectLibraryScene(
    store.document,
    project(store.document, store.document.pages[0].id)[0],
    store.revision,
  );
async function wait(value: string, action = false) {
  while (
    !events.some(
      (e) => e.version === 2 && e.kind === "change" && e.value === value,
    ) ||
    (action &&
      !events.some(
        (e) => e.version === 2 && e.kind === "action" && e.nodeId === "button",
      ))
  ) {
    assert.ok(
      Date.now() < deadline,
      "Physical scene input evidence missing: " + value,
    );
    await Bun.sleep(20);
  }
}
async function render(name: string, reset = false) {
  const checkpoint = store.checkpoint(),
    reply = await native.renderScene(scene(), reset);
  assert.ok(reply.version === 2 && reply.kind === "rendered");
  assert.deepEqual(store.checkpoint(), checkpoint);
  await Bun.write(
    `build/library-preview-native/scene-human-${name}.png`,
    Buffer.from(reply.png, "base64"),
  );
  records.push({
    name,
    ...reply,
    png: undefined,
    pngSHA256: new Bun.CryptoHasher("sha256")
      .update(Buffer.from(reply.png, "base64"))
      .digest("hex"),
  });
}
try {
  await native.ready;
  await render("before");
  await Bun.write(
    "build/library-preview-native/scene-human-owner.json",
    JSON.stringify({ build, pid: native.owner.child.pid }),
  );
  console.log(
    JSON.stringify({
      phase: "initial",
      bundle: build.bundle,
      pid: native.owner.child.pid,
      task: "Click Save & Continue; use Cmd-A in Email and type qa with keyboard events",
    }),
  );
  await wait("qa", true);
  store.transact({
    documentId: store.document.id,
    expectedRevision: store.revision,
    requestId: crypto.randomUUID(),
    operations: [
      {
        type: "node.update",
        id: "button",
        patch: { text: "Updated source label" },
      },
    ],
  });
  await render("updated");
  console.log(
    "PHASE updated: append x without clicking or selecting the Email field; expected qax",
  );
  await wait("qax");
  store.undo();
  assert.deepEqual(store.document, original);
  await render("undo");
  console.log("PHASE undo: append y without refocusing; expected qaxy");
  await wait("qaxy");
  await render("reset", true);
  console.log(
    "PHASE reset: observe consumer@example.test; use Cmd-A and type reset",
  );
  await wait("reset");
  await render("final");
  const recorded = events.filter((e) => e.kind !== "rendered");
  assert.ok(
    recorded.every(
      (e) =>
        (e.version === 1 && e.kind === "ready") ||
        (e.version === 2 && ["action", "change"].includes(e.kind)),
    ),
  );
  assert.deepEqual(store.document, original);
  await Bun.write(
    "build/library-preview-native/scene-human-report.json",
    JSON.stringify(
      {
        passed: true,
        build,
        records,
        events: recorded,
        checks: [
          "physical Button action",
          "physical keyboard Input change",
          "focused input and value survive authored label update",
          "focused input and value survive source undo",
          "reset restores authored initial value",
          "narrow node-ID events",
          "source document unchanged by native input",
        ],
        remaining: [
          "full VoiceOver audit",
          "editor diagnostics",
          "final four-runtime comparison",
          "exact-head review/CI and main",
        ],
        stats: native.owner.stats(),
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: physical native scene keyboard/action, focused state through source update/undo and reset",
  );
  await Bun.sleep(3000); // Allow the final accessibility observation before owned cleanup.
} finally {
  native.stop();
  await native.owner.done.catch(() => {});
}
