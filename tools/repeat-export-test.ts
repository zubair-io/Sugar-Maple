import { exportNode } from "../src/web/src/app/model/export";
import { DocumentStore } from "../src/web/src/app/model/store";
import { strict as assert } from "node:assert";
import { resolve } from "node:path";
const folder = resolve("build/native-acceptance");
const fixture = await Bun.file(resolve(folder, "repeat-fixture.json")).json();
const reopened = DocumentStore.fromCheckpoint(
  await Bun.file(resolve(folder, "repeat-native-reopened.json")).json(),
);
assert.deepEqual(reopened.document, fixture.checkpoint.document);
const before = reopened.document;
reopened.undo();
assert.equal(Object.keys(reopened.document.assets).length, 0);
reopened.redo();
assert.deepEqual(reopened.document, before);
const source = exportNode(reopened.document, fixture.grid, "swiftui");
assert.equal(exportNode(reopened.document, fixture.grid, "swiftui"), source);
const key = Object.keys(reopened.document.assets)[0].replace(/-/g, "_");
const path = resolve(folder, "repeat-consumer.swift"),
  executable = resolve(folder, "repeat-consumer");
await Bun.write(
  path,
  source +
    `
@main struct RepeatConsumer {
@MainActor static func main() {
NSApplication.shared.setActivationPolicy(.accessory)
NSApplication.shared.finishLaunching()
let image = NSImage(data: SugarMapleAssets.${key})!
precondition(image.size.width == 1 && image.size.height == 1)
let host = NSHostingView(rootView: SugarMapleView())
host.frame = NSRect(x:0,y:0,width:432,height:220)
host.layoutSubtreeIfNeeded()
let bitmap = host.bitmapImageRepForCachingDisplay(in: host.bounds)!
host.cacheDisplay(in: host.bounds, to: bitmap)
precondition(bitmap.pixelsWide > 0 && bitmap.pixelsHigh > 0)
print("PASS: generated self-contained SwiftUI Repeat Grid consumer compiles and renders, shared embedded bytes decode once; actual native checkpoint reopens with one-batch undo/redo")
}
}
`,
);
for (const command of [
  ["swiftc", "-parse-as-library", path, "-o", executable],
  [executable],
]) {
  const child = Bun.spawn(command, { stdout: "inherit", stderr: "inherit" });
  assert.equal(await child.exited, 0);
}
