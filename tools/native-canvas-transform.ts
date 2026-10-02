import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { blankDocument, NodeSchema } from "../src/web/src/app/model/schema";
import { DocumentStore } from "../src/web/src/app/model/store";
if (process.platform !== "darwin")
  throw Error("Canvas native transforms require macOS");
const placement = process.argv.includes("--placement");
const reparent = process.argv.includes("--reparent");
const root = resolve(import.meta.dir, ".."),
  output = resolve(
    root,
    reparent ? "build/native-canvas-reparent" : placement
      ? "build/native-canvas-placement"
      : "build/native-canvas-transforms",
  );
mkdirSync(output, { recursive: true });
const doc = blankDocument(),
  pageId = doc.pages[0].id;
doc.nodes = [
  NodeSchema.parse({
    id: "parent",
    name: "Rotated parent",
    pageId,
    kind: "frame",
    x: 40,
    y: 40,
    width: 500,
    height: 450,
    rotation: 35,
    strokeWidth: 2,
  }),
  NodeSchema.parse({
    id: "child",
    name: "Rotated child",
    pageId,
    parentId: "parent",
    kind: "rectangle",
    x: 140,
    y: 160,
    width: 160,
    height: 90,
    rotation: 30,
    fill: "#2563eb",
  }),
];
const fixture = resolve(output, "fixture.json"),
  executable = resolve(output, "native-transforms");
await Bun.write(fixture, JSON.stringify(new DocumentStore(doc).checkpoint()));
async function run(cmd: string[]) {
  const child = Bun.spawn(cmd, {
    cwd: root,
    stdout: "inherit",
    stderr: "inherit",
  });
  if (await child.exited)
    throw Error("Native Canvas transforms failed: " + cmd[0]);
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
  resolve(
    root,
    reparent ? "tools/canvas-reparent-native-page.js" : placement
      ? "tools/canvas-placement-native-page.js"
      : "tools/canvas-transform-native-page.js",
  ),
  resolve(output, "report.json"),
  resolve(output, "webkit.png"),
  "--transforms",
]);
const report = await Bun.file(resolve(output, "report.json")).json();
if (
  report.result?.passed !== true ||
  report.result?.checks !== (reparent ? 12 : placement ? 16 : 18)
)
  throw Error("Incomplete WK transform proof");
console.log(
  reparent ? "PASS: 12 production WKWebView reparent preview/cancel/apply cases, rotated geometry, responsive sizing, layout rules, stale preview cancellation, inherited guards and exact undo at zoom 0.5/1.5" : placement
    ? "PASS: 16 production WKWebView alignment/distribution DOM cases, zoom 0.5/1.5, independent rotated geometry, locked ancestors, snapping preference without history, exact undo and no console errors"
    : "PASS: 18 production WKWebView resize/rotation keyboard cases, zoom 0.5/1.5, independent pinned-anchor geometry, inherited locks/visibility and exact undo",
);
