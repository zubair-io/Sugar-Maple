import { cpSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
const source = resolve(
  "build/DerivedData/Build/Products/Debug/Sugar Maple.app",
);
if (!existsSync(source)) throw Error("Run bun run build:mac first");
const folder = resolve("build/repeat-qa"),
  app = resolve(folder, "Sugar Maple Repeat QA.app"),
  support = resolve(folder, "profile");
if (existsSync(resolve(support, "mcp-token")))
  throw Error("Quit the owned Repeat QA app before replacing its bundle");
mkdirSync(support, { recursive: true });
cpSync(source, app, { recursive: true, force: true });
const plist = resolve(app, "Contents/Info.plist");
const patch = Bun.spawn(
  [
    "python3",
    "-c",
    `import plistlib,sys
p=sys.argv[1]
with open(p,'rb') as f: data=plistlib.load(f)
data['CFBundleIdentifier']='io.zubair.SugarMaple.RepeatQA'
data['CFBundleName']='Sugar Maple Repeat QA'
data['CFBundleDisplayName']='Sugar Maple Repeat QA'
data['SugarMapleTestSupport']=sys.argv[2]
data['SugarMapleTestPort']=48491
with open(p,'wb') as f: plistlib.dump(data,f)
`,
    plist,
    support,
  ],
  { stdout: "inherit", stderr: "inherit" },
);
if (await patch.exited) throw Error("Failed to prepare QA bundle metadata");
const sign = Bun.spawn(["codesign", "--force", "--deep", "--sign", "-", app], {
  stdout: "inherit",
  stderr: "inherit",
});
if (await sign.exited) throw Error("Failed to sign QA copy");
console.log(JSON.stringify({ app, support, port: 48491 }, null, 2));
