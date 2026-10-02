import { resolve } from "node:path";
const root = resolve(import.meta.dir, "..");
async function run(cmd: string[], cwd = root) {
  const p = Bun.spawn(cmd, { cwd, stdout: "inherit", stderr: "inherit" });
  if (await p.exited) throw Error(`Failed: ${cmd[0]}`);
}
const node = resolve(root, "node_modules/.bin/node");
if (!(await Bun.file(node).exists()))
  throw Error("Pinned Node runtime missing; run bun install --frozen-lockfile");
// The CI Bun-hosted Angular CLI reported completion but kept its esbuild
// process alive. Use the already pinned Node runtime for this packaging phase.
console.log("Mac build phase: web (pinned Node)");
await run(
  [
    node,
    resolve(root, "node_modules/@angular/cli/bin/ng.js"),
    "build",
    "--base-href",
    "./",
  ],
  resolve(root, "src/web"),
);
console.log("Mac build phase: Xcode");
await run([
  "xcodebuild",
  "-project",
  "src/apple/Sugar Maple.xcodeproj",
  "-scheme",
  "Sugar Maple",
  "-configuration",
  "Debug",
  "-destination",
  "platform=macOS",
  "-derivedDataPath",
  "build/DerivedData",
  "CODE_SIGNING_ALLOWED=NO",
  "build",
]);
const app = resolve(
  root,
  "build/DerivedData/Build/Products/Debug/Sugar Maple.app",
);
console.log("Mac build phase: signing");
await run(["codesign", "--force", "--deep", "--sign", "-", app]);
if (process.argv.includes("--open")) await run(["open", app]);
console.log(app);
