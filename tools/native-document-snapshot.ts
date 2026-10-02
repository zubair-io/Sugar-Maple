import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { DocumentStore } from "../src/web/src/app/model/store";
if (process.platform !== "darwin")
  throw Error("Native document snapshot checks require macOS");
const root = resolve(import.meta.dir, ".."),
  output = resolve(root, "build/native-document-snapshot");
mkdirSync(output, { recursive: true });
const fixture = resolve(output, "fixture.json"),
  executable = resolve(output, "native-document-snapshot");
await Bun.write(fixture, JSON.stringify(new DocumentStore().checkpoint()));
async function run(cmd: string[]) {
  const child = Bun.spawn(cmd, {
    cwd: root,
    stdout: "inherit",
    stderr: "inherit",
  });
  if (await child.exited)
    throw Error("Native document snapshot check failed: " + cmd[0]);
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
  resolve(root, "tools/document-snapshot-page.js"),
  resolve(output, "report.json"),
  resolve(output, "webkit.png"),
  "--transforms",
]);
const report = await Bun.file(resolve(output, "report.json")).json();
if (report.result?.passed !== true || report.result?.checks !== 7)
  throw Error("Incomplete WK document snapshot proof");
console.log(
  "PASS: four production WK public read snapshots cannot mutate scene/history, followed by exact undo/redo; JavaScript calls, no new OS-input claim",
);
