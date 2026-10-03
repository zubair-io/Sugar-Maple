import { resolve } from "node:path";
import { supervise } from "../prototypes/library-preview/native/supervise";

// This harness executes trusted repository fixtures, never document source.
export async function runOwnedBrowserSuite(scripts: string[]) {
  let url = "",
    output = "",
    failure: unknown;
  let server: ReturnType<typeof supervise> | undefined;
  let test: ReturnType<typeof supervise> | undefined;
  let interrupted = false;
  const groups = new Set<number>();
  const killGroup = (id: number) => {
    try {
      process.kill(-id, "SIGKILL");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  };
  const liveGroups = (ids: number[]) => {
    const ps = Bun.spawnSync(["/bin/ps", "-axo", "pid=,pgid=,uid=,stat="]);
    if (ps.exitCode !== 0)
      throw Error("Browser cleanup process inspection failed");
    return ps.stdout
      .toString()
      .trim()
      .split("\n")
      .flatMap((line) => {
        const [pid, group, uid, state] = line.trim().split(/\s+/);
        return ids.includes(Number(group)) && !state.startsWith("Z")
          ? [{ pid: Number(pid), group: Number(group), uid: Number(uid) }]
          : [];
      });
  };
  async function cleanGroups(ids: number[]) {
    const deadline = performance.now() + 30000;
    while (true) {
      const live = liveGroups(ids);
      if (!live.length) {
        for (const id of ids) groups.delete(id);
        return;
      }
      if (live.some((p) => p.uid !== process.getuid?.()))
        throw Error(
          "Browser cleanup found a foreign process owner; refusing to signal its group",
        );
      for (const id of new Set(live.map((p) => p.group))) {
        try {
          killGroup(id);
        } catch (error) {
          // Darwin may return EPERM for a group that disappeared after ps.
          // A fresh empty inventory proves cleanup; any live member still fails.
          if (
            (error as NodeJS.ErrnoException).code !== "EPERM" ||
            liveGroups([id]).length
          )
            throw error;
        }
      }
      if (performance.now() > deadline)
        throw Error("Owned browser processes survived cleanup");
      await Bun.sleep(100);
    }
  }
  let suiteFailure: unknown;
  const report = {
    checkout: process.cwd(),
    revision: Bun.spawnSync(["git", "rev-parse", "HEAD"])
      .stdout.toString()
      .trim(),
    dirty: Bun.spawnSync(["git", "status", "--porcelain"])
      .stdout.toString()
      .trim(),
    url: "",
    testsPassed: [] as string[],
    cleanupPassed: false,
    failure: "",
    cleanupFailure: "",
  };
  const reportPath = resolve(
    `build/browser-acceptance-${crypto.randomUUID()}.json`,
  );
  const stop = () => {
    interrupted = true;
    test?.stop("Browser suite interrupted");
    server?.stop("Browser suite interrupted");
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  try {
    server = supervise(
      [
        process.execPath,
        "run",
        "--cwd",
        resolve("src/web"),
        "start",
        "--host",
        "127.0.0.1",
        "--port",
        "0",
      ],
      {
        wallMilliseconds: 600000,
        rssKiB: 2097152,
        outputBytes: 2000000,
        onOutput(bytes) {
          output = (output + bytes.toString())
            .slice(-10000)
            .replace(/\x1b\[[0-9;]*m/g, "");
          const address = output.match(
            /Local:\s+(http:\/\/127\.0\.0\.1:(\d+))\//,
          );
          if (address && Number(address[2]) > 0 && Number(address[2]) <= 65535)
            url = address[1];
        },
      },
      {
        ...process.env,
        PATH: resolve("node_modules/.bin") + ":" + process.env.PATH,
      },
    );
    if (server.child.pid) groups.add(server.child.pid);
    void server.done.catch((error) => {
      failure = error;
    });
    const deadline = performance.now() + 60000;
    while (true) {
      if (
        interrupted ||
        failure ||
        server.child.exitCode !== null ||
        performance.now() > deadline
      )
        throw Error(
          `Owned browser server failed: ${failure ?? server.stats().stderr}`,
        );
      if (url) {
        try {
          if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok)
            break;
        } catch {
          /* Only our child's bound URL is retried. */
        }
      }
      await Bun.sleep(100);
    }
    report.url = url;
    console.log(
      `Owned browser editor: ${url}; checkout ${report.checkout}; revision ${report.revision}`,
    );
    for (const script of scripts) {
      if (interrupted || failure || server.child.exitCode !== null)
        throw Error(
          `Owned browser server stopped: ${failure ?? server.child.exitCode}`,
        );
      test = supervise(
        [process.execPath, script],
        {
          wallMilliseconds: 600000,
          rssKiB: 2097152,
          outputBytes: 2000000,
          onOutput: (bytes) => process.stdout.write(bytes),
        },
        { ...process.env, SUGAR_MAPLE_TEST_URL: url },
      );
      if (test.child.pid) groups.add(test.child.pid);
      await test.done;
      // A fixture may exit while descendants survive; close its owned group too.
      if (test.child.pid) await cleanGroups([test.child.pid]);
      test = undefined;
      if (interrupted || failure || server.child.exitCode !== null)
        throw Error(
          `Owned browser server stopped: ${failure ?? server.child.exitCode}`,
        );
      report.testsPassed.push(script);
    }
  } catch (error) {
    suiteFailure = error;
    report.failure = String(error).slice(0, 4000);
  } finally {
    test?.stop("Browser suite finished");
    server?.stop("Browser suite finished");
    await test?.done.catch(() => {});
    await server?.done.catch(() => {});
    try {
      await cleanGroups([...groups]);
      report.cleanupPassed = true;
    } catch (error) {
      report.cleanupFailure = String(error).slice(0, 4000);
      suiteFailure = suiteFailure
        ? new AggregateError(
            [suiteFailure, error],
            "Browser fixture and cleanup failed",
          )
        : error;
    }
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    await Bun.write(reportPath, JSON.stringify(report, null, 2));
    console.log(`Browser source/cleanup report: ${reportPath}`);
  }
  if (suiteFailure) throw suiteFailure;
  return report;
}
