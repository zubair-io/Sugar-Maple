import { strict as assert } from "node:assert";
import { resolve } from "node:path";
import { supervise } from "./native/supervise";

if (
  !process.argv.includes("--trust-native-fixture") ||
  !process.env.MAPLE_COMPARISON_EDITOR_URL
)
  throw Error(
    "Native stop regression requires the owned comparison server and explicit native opt-in",
  );

const entry = "compare.ts";
const fault = "Owned native shutdown failure fixture";
const marker = "Owned native shutdown cleanup boundary";
const completed = "PASS: real Canvas/DOM fixture geometry and inspector undo";
const cleanupMilliseconds = 30000;

// A comparison includes bounded compilation and the full real consumer suite.
// Its preparation allowance matches the owned editor's 10-minute lifetime.
// The unchanged 30-second cleanup deadline starts only after native stop.
// Native build/runtime resource limits remain enforced by their own owners.
async function observe(command: string[], leakedServer = false) {
  let output = "",
    timer: ReturnType<typeof setTimeout> | undefined;
  let boundaryAt = 0,
    cleanupExpired = false;
  const started = performance.now();
  const owner = supervise(command, {
    wallMilliseconds: 600000,
    rssKiB: 2097152,
    outputBytes: 20000,
    onOutput(bytes) {
      output += bytes.toString();
      if (!boundaryAt && output.includes(marker)) {
        boundaryAt = performance.now();
        timer = setTimeout(() => {
          cleanupExpired = true;
          owner.stop("Native shutdown cleanup deadline exceeded");
        }, cleanupMilliseconds);
      }
    },
  });
  try {
    if (leakedServer) {
      await assert.rejects(
        owner.done,
        /Native shutdown cleanup deadline exceeded/,
      );
      assert.equal(cleanupExpired, true);
    } else {
      const result = await owner.done;
      assert.equal(result.code, 0);
      assert.equal(cleanupExpired, false);
    }
    assert.ok(boundaryAt, "The native-stop boundary was observed");
    assert.ok(
      output.includes(completed),
      "The entire comparison succeeded before injected shutdown failure",
    );
    assert.ok(
      output.indexOf(completed) < output.indexOf(marker),
      "Successful comparison precedes shutdown",
    );
    return {
      preparationMilliseconds: boundaryAt - started,
      cleanupMilliseconds: performance.now() - boundaryAt,
      cleanupDeadlineMilliseconds: cleanupMilliseconds,
      leakedServerRejected: leakedServer,
      ...owner.stats(),
    };
  } catch (error) {
    console.error("Native shutdown fixture retained output:\n" + output);
    console.error(
      "Native shutdown fixture retained stderr:\n" + owner.stats().stderr,
    );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// Stop the real native owner first, then inject an error at the actual stop
// boundary. Browser/server finally blocks must still let the child exit.
const source = `
  import {NativePreview} from ${JSON.stringify(resolve("prototypes/library-preview/native/controller.ts"))};
  const original=NativePreview.prototype.stop;let injected=false;
  NativePreview.prototype.stop=function(...args){original.apply(this,args);if(!injected){injected=true;console.log(${JSON.stringify(marker)});throw Error(${JSON.stringify(fault)});}};
  try {await import(${JSON.stringify(resolve("prototypes/library-preview", entry))});process.exitCode=1;}
  catch(error){if(!injected||!String(error).includes(${JSON.stringify(fault)}))throw error;console.log('Caught owned native shutdown failure');}
`;
const comparison = await observe([
  process.execPath,
  "-e",
  source,
  "--",
  "--trust-native-fixture",
]);

// A real unclosed Bun listener must keep its owner alive and fail the same
// cleanup deadline. This negative fixture cannot turn a leak into a pass.
const leak = await observe(
  [
    process.execPath,
    "-e",
    `
  const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(){return new Response('Owned leak fixture');}});
  console.log(${JSON.stringify(completed)});
  console.log(${JSON.stringify(marker)});
`,
  ],
  true,
);
await Bun.write(
  "build/library-preview-native-stop.json",
  JSON.stringify({ passed: true, comparison, leak }, null, 2),
);
console.log(
  "PASS: complete actual comparison exits naturally after native shutdown failure; real leaked listener fails the unchanged 30-second cleanup deadline",
);
