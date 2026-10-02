import { mkdirSync, copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { chromium } from "../src/web/node_modules/@playwright/test";
import {
  webAwesomeManifest as manifest,
  libraryFixture,
} from "./library-fixture";
import { exportNode } from "../src/web/src/app/model/export";
const root = resolve(import.meta.dir, ".."),
  folder = resolve(root, "build/library-consumer");
mkdirSync(folder, { recursive: true });
async function run(command: string[]) {
  const p = Bun.spawn(command, {
    cwd: folder,
    stdout: "inherit",
    stderr: "inherit",
  });
  if (await p.exited)
    throw Error("Pinned library consumer failed: " + command[0]);
}
const lock = await Bun.file(
  resolve(root, "tools/fixtures/library-consumer/package-lock.json"),
).text();
const hash = createHash("sha256").update(lock).digest("hex"),
  hashPath = resolve(folder, "lock.sha256");
if (!existsSync(hashPath) || (await Bun.file(hashPath).text()) !== hash) {
  for (const name of ["package.json", "package-lock.json"])
    copyFileSync(
      resolve(root, "tools/fixtures/library-consumer", name),
      resolve(folder, name),
    );
  await run(["npm", "ci", "--ignore-scripts"]);
  await Bun.write(hashPath, hash);
}
assert.equal(
  (
    await Bun.file(
      resolve(folder, "node_modules/@awesome.me/webawesome/package.json"),
    ).json()
  ).version,
  manifest.package.version,
);
for (const [name, version] of Object.entries(manifest.dependencies))
  assert.equal(
    (
      await Bun.file(
        resolve(folder, "node_modules", name, "package.json"),
      ).json()
    ).version,
    version,
  );
const store = libraryFixture();
const output = exportNode(store.document, "root", "web-library");
assert.equal(output, exportNode(store.document, "root", "web-library"));
const script = output.match(/<script type="module">([\s\S]*?)<\/script>/)![1];
await Bun.write(resolve(folder, "entry.ts"), script);
await Bun.write(
  resolve(folder, "api-check.ts"),
  `import WaButton from '@awesome.me/webawesome/dist/components/button/button.js';\nimport WaInput from '@awesome.me/webawesome/dist/components/input/input.js';\nimport WaCard from '@awesome.me/webawesome/dist/components/card/card.js';\nconst button: WaButton = document.createElement('wa-button'); button.variant='brand'; button.appearance='accent'; button.disabled=true;\nconst input: WaInput = document.createElement('wa-input'); input.type='email'; input.label='Email'; input.value='consumer@example.test'; input.disabled=false;\nconst card: WaCard = document.createElement('wa-card'); card.append(input,button);\n`,
);
await run([
  process.execPath,
  resolve(root, "src/web/node_modules/typescript/bin/tsc"),
  "--noEmit",
  "--strict",
  "--skipLibCheck",
  "--target",
  "ES2022",
  "--module",
  "ESNext",
  "--moduleResolution",
  "bundler",
  "api-check.ts",
]);
const build = await Bun.build({
  entrypoints: [resolve(folder, "entry.ts")],
  outdir: resolve(folder, "dist"),
  target: "browser",
  format: "esm",
  minify: false,
});
if (!build.success)
  throw Error("Library browser bundle failed: " + build.logs.join("\n"));

const css = build.outputs
  .filter((file) => file.path.endsWith(".css"))
  .map(
    (file) =>
      `<link rel="stylesheet" href="/dist/${file.path.split("/").at(-1)}">`,
  )
  .join("");
await Bun.write(
  resolve(folder, "index.html"),
  output.replace(
    /<script type="module">[\s\S]*?<\/script>/,
    css + '<script type="module" src="/dist/entry.js"></script>',
  ),
);
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch(request) {
    const pathname = new URL(request.url).pathname;
    if (pathname.includes("..")) return new Response("Denied", { status: 403 });
    const file = Bun.file(
      folder + (pathname === "/" ? "/index.html" : pathname),
    );
    return new Response(file);
  },
});
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1"
      ? route.continue()
      : route.abort(),
  );
  await page.goto(`http://127.0.0.1:${server.port}/`);
  await page.waitForFunction(
    () =>
      !!document.querySelector("wa-input")?.shadowRoot?.querySelector("input"),
  );
  assert.deepEqual(
    await page.locator("wa-button").evaluate((el: any) => ({
      name: el.constructor.name,
      text: el.textContent,
      disabled: el.disabled,
      variant: el.variant,
    })),
    {
      name: "WaButton",
      text: "Save & Continue",
      disabled: false,
      variant: "neutral",
    },
  );
  assert.equal(
    await page.locator("wa-input").evaluate((el: any) => el.value),
    "consumer@example.test",
  );
  await page.locator("wa-input").locator("input").fill("changed@example.test");
  assert.equal(
    await page.locator("wa-input").evaluate((el: any) => el.value),
    "changed@example.test",
  );
  assert.equal(
    await page
      .locator("wa-card")
      .evaluate((el) =>
        getComputedStyle(el).getPropertyValue("--spacing").trim(),
      ),
    "24px",
  );
  assert.equal(
    await page.locator("[slot=header]").textContent(),
    "Pinned library consumer",
  );
  assert.equal(
    await page.locator("[slot=footer]").textContent(),
    "Save & Continue",
  );
  assert.deepEqual(errors, []);
  await page.screenshot({ path: resolve(folder, "consumer.png") });
} finally {
  await browser.close();
  server.stop(true);
}
await Bun.write(
  resolve(folder, "fixture.json"),
  JSON.stringify(store.checkpoint()),
);
await Bun.write(
  resolve(folder, "mapped.swift"),
  exportNode(store.document, "root", "swift-library"),
);
console.log(
  "PASS: exact Web Awesome 3.14.0 declarations compile; generated Button/Input/Card imports bundle and render offline with real shadow controls, values, slots and declared card spacing",
);
