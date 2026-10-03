import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { importedRepeatFixture } from "./repeat-fixture";
if (process.platform !== "darwin")
  throw Error("Native Repeat Grid acceptance requires macOS");
const root = resolve(import.meta.dir, ".."),
  folder = resolve(root, "build/repeat-handles");
mkdirSync(folder, { recursive: true });
const fixture = resolve(folder, "fixture.json"),
  executable = resolve(folder, "native-repeat-handles");
await Bun.write(
  fixture,
  JSON.stringify(importedRepeatFixture().store.checkpoint()),
);
async function run(command: string[]) {
  const child = Bun.spawn(command, {
    cwd: root,
    stdout: "inherit",
    stderr: "inherit",
  });
  if (await child.exited)
    throw Error("Native Repeat Grid failed: " + command[0]);
}
await run([
  "swiftc",
  "src/apple/Sugar Maple/NativeAccessPolicy.swift",
  "tools/native-canvas-benchmark.swift",
  "-o",
  executable,
]);
await run([
  executable,
  resolve(root, "src/web/dist/sugar-maple-editor/browser"),
  fixture,
  resolve(root, "tools/repeat-native-page.js"),
  resolve(folder, "native-report.json"),
  resolve(folder, "native.png"),
  "--transforms",
]);
const report = await Bun.file(resolve(folder, "native-report.json")).json();
if (report.result?.passed !== true || report.result?.checks !== 20)
  throw Error("Incomplete native Repeat Grid proof");
console.log(
  "PASS: 20 production WK Repeat Grid control/data/history cases; synthetic DOM pointer IDs use a local capture shim",
);
