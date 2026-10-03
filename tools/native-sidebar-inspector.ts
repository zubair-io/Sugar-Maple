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
for (const theme of ["light", "dark"])
  for (const width of [260, 320, 420]) {
    const script = resolve(output, `evidence-${width}-${theme}.js`);
    await Bun.write(
      script,
      `window.sidebarEvidence=${JSON.stringify({ theme, width })};\n` +
        (await Bun.file(
          resolve(root, "tools/sidebar-inspector-page.js"),
        ).text()),
    );
    await run([
      executable,
      resolve(root, "src/web/dist/sugar-maple-editor/browser"),
      fixture,
      script,
      resolve(output, `${width}-${theme}.json`),
      resolve(output, `${width}-${theme}.png`),
      "--transforms",
      "--always-scrollbars",
    ]);
    const report = await Bun.file(
      resolve(output, `${width}-${theme}.json`),
    ).json();
    if (report.result?.passed !== true || report.result?.checks !== 8)
      throw Error("Incomplete native sidebar/contextual inspector proof");
  }
console.log(
  "PASS: production WK keyboard page/tree, contextual prototype/copy and locked/comments acceptance",
);
