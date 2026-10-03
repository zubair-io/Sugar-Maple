import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { DocumentStore } from "../src/web/src/app/model/store";
if (process.platform !== "darwin")
  throw Error("Native sidebar/contextual inspector acceptance requires macOS");
const root = resolve(import.meta.dir, ".."),
  output = resolve(root, "build/native-sidebar-inspector");
mkdirSync(output, { recursive: true });
const fixture = resolve(output, "fixture.json"),
  executable = resolve(output, "native-sidebar-inspector");
await Bun.write(fixture, JSON.stringify(new DocumentStore().checkpoint()));
async function run(args: string[]) {
  const child = Bun.spawn(args, {
    cwd: root,
    stdout: "inherit",
    stderr: "inherit",
  });
  if (await child.exited)
    throw Error(
      "Native sidebar/contextual inspector acceptance failed: " + args[0],
    );
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
  resolve(root, "tools/sidebar-inspector-page.js"),
  resolve(output, "report.json"),
  resolve(output, "webkit.png"),
  "--transforms",
  "--always-scrollbars",
]);
const report = await Bun.file(resolve(output, "report.json")).json();
if (report.result?.passed !== true || report.result?.checks !== 8)
  throw Error("Incomplete native sidebar/contextual inspector proof");
console.log(
  "PASS: production WK sidebar/contextual values/batch/undo/guard and mode insertion acceptance",
);
