import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { DocumentStore } from "../src/web/src/app/model/store";
if (process.platform !== "darwin")
  throw Error("Native workspace acceptance requires macOS");
const root = resolve(import.meta.dir, ".."),
  output = resolve(root, "build/native-workspace");
mkdirSync(output, { recursive: true });
const fixture = resolve(output, "fixture.json"),
  executable = resolve(output, "native-workspace");
await Bun.write(fixture, JSON.stringify(new DocumentStore().checkpoint()));
async function run(args: string[]) {
  const child = Bun.spawn(args, {
    cwd: root,
    stdout: "inherit",
    stderr: "inherit",
  });
  if (await child.exited)
    throw Error("Native workspace acceptance failed: " + args[0]);
}
await run([
  "swiftc",
  "src/apple/Sugar Maple/NativeAccessPolicy.swift",
  "tools/native-canvas-benchmark.swift",
  "-o",
  executable,
]);
for (const [width, height] of [
  [1440, 900],
  [1024, 768],
  [800, 768],
]) {
  await run([
    executable,
    resolve(root, "src/web/dist/sugar-maple-editor/browser"),
    fixture,
    resolve(root, "tools/workspace-page.js"),
    resolve(output, `${width}.json`),
    resolve(output, `${width}.png`),
    "--transforms",
    "--always-scrollbars",
    `--size=${width}x${height}`,
  ]);
  const report = await Bun.file(resolve(output, `${width}.json`)).json();
  if (report.result?.passed !== true || report.result?.checks !== 2)
    throw Error("Incomplete native workspace proof");
}
console.log(
  "PASS: actual production WK shell at1440/1024/800 in both appearances, keyboard resizing/bounds/preferences and MCP focus with exact checkpoint preservation",
);
