import { strict as assert } from "node:assert";
import { resolve } from "node:path";
import { supervise } from "./native/supervise";

// Inject failure into the real launch boundary, then let the child exit
// naturally. A leaked Bun server keeps it alive until the owner deadline.
for (const entry of [
  "browser-test.ts",
  "compare.ts",
  "scene-compare.ts",
  "report-test.ts",
])
  for (const boundary of ["launch", "close"]) {
    const fault = "Owned " + boundary + " failure fixture";
    const launch =
      boundary === "launch"
        ? `async () => { throw Error(${JSON.stringify(fault)}); }`
        : `async () => ({newPage:async()=>{throw Error('Owned body failure');},newContext:async()=>{throw Error('Owned body failure');},close:async()=>{throw Error(${JSON.stringify(fault)});}})`;
    const source = `
    import {chromium} from ${JSON.stringify(resolve("src/web/node_modules/@playwright/test"))};
    chromium.launch = ${launch};
    try { await import(${JSON.stringify(resolve("prototypes/library-preview", entry))}); process.exitCode = 1; }
    catch(error) { if (!String(error).includes(${JSON.stringify(fault)})) throw error; console.log('Caught owned boundary failure'); }
  `;
    const owner = supervise(
      [process.execPath, "-e", source, "--", "--trust-native-fixture"],
      { wallMilliseconds: 5000, rssKiB: 524288, outputBytes: 20000 },
      { ...process.env, MAPLE_COMPARISON_EDITOR_URL: "http://127.0.0.1:9" },
    );
    const result = await owner.done;
    assert.equal(result.code, 0);
    console.log(
      `PASS: ${entry} stops its server when the browser ${boundary} boundary throws`,
    );
  }
