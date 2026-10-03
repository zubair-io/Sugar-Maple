import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { comparisonProcessRegistry } from "./native/process-registry";

const canary = crypto.randomUUID();
const unrelated = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: () => new Response(canary),
});
const results = [];
try {
  for (const scenario of [
    "transient-denial",
    "persistent-denial",
    "foreign-uid",
    "changed-start",
  ]) {
    const registry = comparisonProcessRegistry();
    const helper = spawn(
      process.execPath,
      [
        "-e",
        'Bun.serve({hostname:"127.0.0.1",port:0,fetch:()=>new Response("owned")});console.log("ready");setInterval(()=>{},1000)',
      ],
      { detached: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    const closed = new Promise<void>((resolve) =>
      helper.once("close", () => resolve()),
    );
    const originalKill = process.kill;
    let attempts = 0;
    try {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          new Promise<void>((resolve, reject) => {
            helper.stdout.once("data", () => resolve());
            helper.once("error", reject);
          }),
          new Promise<void>((_, reject) => {
            timer = setTimeout(
              () => reject(Error("Owned helper preparation timed out")),
              10000,
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
      const group = helper.pid!;
      assert.ok(group > 0);
      registry.record(group);
      const journal = Object.values(registry.env)[0];
      if (scenario === "foreign-uid" || scenario === "changed-start") {
        const entry = JSON.parse((await Bun.file(journal).text()).trim());
        if (scenario === "foreign-uid") entry.uid++;
        else entry.started = "different process generation";
        await Bun.write(journal, JSON.stringify(entry) + "\n");
      }
      process.kill = ((pid: number, signal?: NodeJS.Signals | number) => {
        if (pid === -group && signal === "SIGKILL") {
          attempts++;
          if (
            scenario === "persistent-denial" ||
            (scenario === "transient-denial" && attempts === 1)
          )
            throw Object.assign(Error("Controlled owned-group denial"), {
              code: "EPERM",
            });
        }
        return originalKill(pid, signal);
      }) as typeof process.kill;
      const started = performance.now();
      if (scenario === "transient-denial") {
        const result = await registry.cleanup(started + 30000);
        assert.deepEqual(result.live, []);
        assert.ok(attempts >= 2, "A live group was rechecked after denial");
        await closed;
      } else if (scenario === "persistent-denial") {
        // A stricter trusted-test deadline proves denial cannot be called clean.
        await assert.rejects(
          registry.cleanup(started + 200),
          /survived.*cleanup deadline/,
        );
        assert.ok(attempts >= 2);
        assert.equal(
          helper.exitCode,
          null,
          "A denied live owner remains a failure",
        );
      } else {
        await assert.rejects(
          registry.cleanup(started + 200),
          /identity changed; refusing/,
        );
        assert.equal(
          attempts,
          0,
          "Identity mismatch is rejected before signaling",
        );
      }
      assert.equal(await (await fetch(unrelated.url)).text(), canary);
      results.push({
        scenario,
        group,
        attempts,
        elapsedMs: Math.round(performance.now() - started),
        canaryPreserved: true,
      });
    } finally {
      process.kill = originalKill;
      if (helper.exitCode === null && helper.signalCode === null && helper.pid) {
        try {
          originalKill(-helper.pid, "SIGKILL");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
        }
      }
      await closed;
      registry.remove();
    }
  }
  mkdirSync("build", { recursive: true });
  await Bun.write(
    "build/process-registry.json",
    JSON.stringify({ passed: true, cases: results }, null, 2),
  );
  console.log(
    "PASS: transient denial reaps owned helper; persistent denial and changed UID/start remain failures; unrelated listener survives",
  );
} finally {
  unrelated.stop(true);
}
