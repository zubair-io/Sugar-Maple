import { supervise } from "./native/supervise";
import { buildNativeFixture } from "./native/build";
import { NativePreview } from "./native/controller";
const scenario = process.argv[2];
if (scenario === "native") {
  const build = await buildNativeFixture(true);
  const preview = new NativePreview(build);
  await preview.ready;
  console.log("Cancellation fixture helper ready: " + preview.owner.child.pid);
} else {
  const helper = supervise(
    [
      process.execPath,
      "-e",
      'const s=Bun.serve({hostname:"127.0.0.1",port:0,fetch:()=>new Response("owned helper")});console.log("listener ready "+s.url);setInterval(()=>{},1000)',
    ],
    {
      wallMilliseconds: 60000,
      rssKiB: 524288,
      outputBytes: 64000000,
      onOutput: (bytes) => process.stdout.write(bytes),
    },
  );
  await new Promise<void>((resolve) =>
    helper.child.stdout.once("data", () => resolve()),
  );
  console.log("Cancellation fixture helper ready: " + helper.child.pid);
}
if (scenario === "fail") throw Error("Controlled comparison stage failure");
if (scenario === "orphan") process.exit(0);
setInterval(() => {}, 1000);
