import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { sceneBorderFixture } from "./scene-border-fixture";
if (process.platform !== "darwin")
  throw Error("Scene border WK acceptance requires macOS");
const root = resolve(import.meta.dir, ".."),
  output = resolve(root, "build/native-scene-border");
await mkdir(output, { recursive: true });
const fixture = resolve(output, "fixture.json"),
  executable = resolve(output, "native-border");
await Bun.write(fixture, JSON.stringify(sceneBorderFixture().checkpoint()));
async function run(args: string[]) {
  const child = Bun.spawn(args, {
    cwd: root,
    stdout: "inherit",
    stderr: "inherit",
  });
  if (await child.exited) throw Error("Native scene border acceptance failed");
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
  resolve(root, "tools/scene-border-page.js"),
  resolve(output, "report.json"),
  resolve(output, "webkit.png"),
  "--transforms",
]);
const report = await Bun.file(resolve(output, "report.json")).json();
if (report.result?.passed !== true || report.result.checks !== 5)
  throw Error("Incomplete WK border evidence");
console.log(
  "PASS: five production WKWebView Canvas/semantic/HTML/CSS free/stack/grid fractional-border geometry and undo cases at unchanged .1-point tolerance",
);
