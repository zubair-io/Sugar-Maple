// The browser acceptance suite installs/checks the committed library-consumer lock.
// This gate builds only our fixed, explicitly trusted fixture from that cache.
for (const args of [
  [
    "test",
    "prototypes/library-preview/contract.test.ts",
    "prototypes/library-preview/scene-contract.test.ts",
  ],
  [
    "src/web/node_modules/typescript/bin/tsc",
    "-p",
    "prototypes/library-preview/tsconfig.json",
  ],
  ["prototypes/library-preview/build.ts", "--trust-fixture"],
  ["prototypes/library-preview/launch-failure-test.ts"],
  ["prototypes/library-preview/browser-test.ts"],
  ["prototypes/library-preview/scene-web-test.ts"],
]) {
  const child = Bun.spawn([process.execPath, ...args], {
    stdout: "inherit",
    stderr: "inherit",
  });
  if (await child.exited)
    throw Error(`Library preview acceptance failed: ${args[0]}`);
}
