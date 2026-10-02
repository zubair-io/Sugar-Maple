import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { libraryFixture } from "./library-fixture";
if (process.platform !== "darwin")
  throw Error("Library diagnostics WK acceptance requires macOS");
const root = resolve(import.meta.dir, ".."),
  output = resolve(root, "build/native-library-diagnostics");
await mkdir(output, { recursive: true });
const fixture = resolve(output, "fixture.json"),
  executable = resolve(output, "native-diagnostics");
await Bun.write(fixture, JSON.stringify(libraryFixture().checkpoint()));
async function run(args: string[]) {
  const child = Bun.spawn(args, {
    cwd: root,
    stdout: "inherit",
    stderr: "inherit",
  });
  if (await child.exited)
    throw Error("Native library diagnostics failed: " + args[0]);
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
  resolve(root, "tools/library-diagnostics-native-page.js"),
  resolve(output, "report.json"),
  resolve(output, "webkit.png"),
  "--transforms",
]);
const report = await Bun.file(resolve(output, "report.json")).json();
if (report.result?.passed !== true || report.result?.checks !== 10)
  throw Error("Incomplete WK library diagnostics evidence");
console.log(
  "PASS: 10 production WKWebView library semantic/package/variant/property/target diagnostics, source paint/history, exact undo/reset and Developer read-only state",
);
