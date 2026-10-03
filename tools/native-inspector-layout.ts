import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { DocumentStore } from "../src/web/src/app/model/store";
if (process.platform !== "darwin")
  throw Error("Native inspector layout acceptance requires macOS");
const root = resolve(import.meta.dir, ".."),
  output = resolve(root, "build/native-inspector-layout");
mkdirSync(output, { recursive: true });
const fixture = resolve(output, "fixture.json"),
  executable = resolve(output, "native-inspector-layout");
await Bun.write(fixture, JSON.stringify(new DocumentStore().checkpoint()));
async function run(args: string[]) {
  const child = Bun.spawn(args, {
    cwd: root,
    stdout: "inherit",
    stderr: "inherit",
  });
  if (await child.exited)
    throw Error("Native web copy acceptance failed: " + args[0]);
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
  resolve(root, "tools/inspector-layout-page.js"),
  resolve(output, "report.json"),
  resolve(output, "webkit.png"),
  "--transforms",
]);
const report = await Bun.file(resolve(output, "report.json")).json();
if (report.result?.passed !== true || report.result?.checks !== 3)
  throw Error("Incomplete native inspector layout proof");
console.log(
  "PASS: production WK Transform icon/field/select legibility at 260/320/420px and exact checkpoint preservation",
);
