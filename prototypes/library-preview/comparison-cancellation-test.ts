import { strict as assert } from "node:assert";
import { mkdirSync } from "node:fs";
const includeNative = process.argv.includes("--trust-native-fixture");
const cases = [
  "SIGINT",
  "SIGTERM",
  "fail",
  "timeout",
  "server-loss",
  "orphan",
  ...(includeNative ? ["native"] : []),
];
const reports = [];
const canary = crypto.randomUUID(),
  listener = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response(canary),
  });
try {
  for (const scenario of cases) {
    const child = Bun.spawn(
      [
        process.execPath,
        "prototypes/library-preview/comparison-cancellation-entry.ts",
        scenario,
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    let log = "",
      ready = false,
      serverGroup = 0;
    const drains = [child.stdout, child.stderr].map(async (stream) => {
      for await (const bytes of stream) {
        log += new TextDecoder().decode(bytes);
        process.stdout.write(bytes);
        const match = log.match(/process group (\d+)/);
        if (match) serverGroup = Number(match[1]);
        ready ||= log.includes("Cancellation fixture helper ready:");
      }
    });
    const deadline = performance.now() + 60000;
    try {
      while (!ready && child.exitCode === null && performance.now() < deadline)
        await Bun.sleep(25);
      assert.ok(ready, "Controlled detached helper reached ready: " + log);
      const started = performance.now();
      if (scenario === "SIGINT" || scenario === "SIGTERM") child.kill(scenario);
      if (scenario === "native") child.kill("SIGTERM");
      if (scenario === "server-loss") process.kill(-serverGroup, "SIGKILL");
      let timeout: ReturnType<typeof setTimeout> | undefined;
      let code: number;
      try {
        code = await Promise.race([
          child.exited,
          new Promise<number>((_, reject) => {
            timeout = setTimeout(
              () => reject(Error("Cancellation exceeded cleanup contract")),
              31000,
            );
          }),
        ]);
      } finally {
        clearTimeout(timeout);
      }
      await Promise.all(drains);
      assert.ok(performance.now() - started < 31000, "Bounded cancellation");
      assert.equal(
        code === 0,
        scenario === "orphan",
        "Failure remains failure: " + log,
      );
      const cleanup = log.match(/Comparison owned process cleanup: (.+)/);
      assert.ok(cleanup, "Cleanup evidence retained on every exit: " + log);
      const result = JSON.parse(cleanup![1]);
      const ps = Bun.spawnSync(["/bin/ps", "-axo", "pid=,pgid=,stat="]);
      assert.equal(ps.exitCode, 0);
      const live = ps.stdout
        .toString()
        .trim()
        .split("\n")
        .filter((line) => {
          const [, group, state] = line.trim().split(/\s+/);
          return (
            result.groups.includes(Number(group)) && !state.startsWith("Z")
          );
        });
      assert.deepEqual(
        live,
        [],
        "No owned server/stage/detached helper remains",
      );
      assert.equal(
        await (await fetch(listener.url)).text(),
        canary,
        "Unrelated listener survives",
      );
      reports.push({
        scenario,
        code,
        groups: result.groups,
        live,
        canaryPreserved: true,
        elapsedMs: Math.round(performance.now() - started),
        scope:
          scenario === "native"
            ? "actual bounded sandboxed SwiftUI helper"
            : "controlled trusted hanging/listening child",
      });
    } finally {
      if (child.exitCode === null) child.kill("SIGTERM");
    }
  }
  mkdirSync("build", { recursive: true });
  await Bun.write(
    "build/comparison-cancellation.json",
    JSON.stringify({ passed: true, cases: reports }, null, 2),
  );
  console.log(
    "PASS: SIGINT/SIGTERM, failure, timeout, server loss and natural-exit detached-helper cleanup preserve unrelated listener",
  );
} finally {
  listener.stop(true);
}
