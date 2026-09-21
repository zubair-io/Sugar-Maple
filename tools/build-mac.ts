import { resolve } from "node:path";
const root = resolve(import.meta.dir, "..");
async function run(cmd: string[]) {
  const p = Bun.spawn(cmd, { cwd: root, stdout: "inherit", stderr: "inherit" });
  if (await p.exited) throw Error(`Failed: ${cmd[0]}`);
}
await run(["bun", "run", "build:web"]);
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
await run(["codesign", "--force", "--deep", "--sign", "-", app]);
if (process.argv.includes("--open")) await run(["open", app]);
console.log(app);
