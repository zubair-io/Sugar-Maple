import { resolve } from "node:path";
import { supervise } from "../prototypes/library-preview/native/supervise";
import { comparisonProcessRegistry } from "../prototypes/library-preview/native/process-registry";

// Only trusted repository callers supply stages; document/protocol input never
// reaches this interface. The CLI below always selects the complete comparison.
export async function runComparison(
  stages: string[][],
  stageWallMilliseconds = 600000,
) {
  let editorURL = "",
    serverOutput = "",
    failure: unknown;
  let server: ReturnType<typeof supervise> | undefined,
    stage: ReturnType<typeof supervise> | undefined;
  let force: ReturnType<typeof setTimeout> | undefined,
    scan: ReturnType<typeof setInterval> | undefined;
  let closing = false,
    interruptionDeadline: number | undefined,
    primaryFailure: unknown;
  const registry = comparisonProcessRegistry();
  const stopStage = (reason: string) => {
    interruptionDeadline ??= performance.now() + 30000;
    if (!stage?.child.pid || stage.child.exitCode !== null) return;
    try {
      registry.captureDescendants(stage.child.pid);
    } catch (error) {
      failure ||= error;
    }
    // Let nested supervisors and Playwright close their detached children first.
    try {
      process.kill(-stage.child.pid, "SIGTERM");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") failure ||= error;
    }
    force ??= setTimeout(() => stage?.stop(reason), 1000);
  };
  const interrupt = () => {
    failure ||= Error("Comparison interrupted");
    stopStage("Comparison interrupted");
    if (!stage) server?.stop("Comparison interrupted");
  };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  try {
    server = supervise(
      [
        process.execPath,
        "run",
        "--cwd",
        "src/web",
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
        onOutput: (bytes) => {
          process.stdout.write(bytes);
          serverOutput = (serverOutput + bytes.toString())
            .slice(-10000)
            .replace(/\x1b\[[0-9;]*m/g, "");
          const address = serverOutput.match(
            /Local:\s+(http:\/\/127\.0\.0\.1:(\d+))\//,
          );
          if (address && Number(address[2]) > 0 && Number(address[2]) <= 65535)
            editorURL = address[1];
        },
      },
      {
        ...process.env,
        ...registry.env,
        PATH: resolve("node_modules/.bin") + ":" + process.env.PATH,
      },
    );
    registry.record(server.child.pid!);
    void server.done.then(
      () => {
        if (!closing) {
          failure ||= Error("Owned comparison server stopped");
          stopStage("Owned comparison server stopped");
        }
      },
      (error) => {
        if (!closing) {
          failure ||= error;
          stopStage("Owned comparison server stopped");
        }
      },
    );
    const deadline = performance.now() + 60000;
    while (true) {
      if (
        failure ||
        server.child.exitCode !== null ||
        performance.now() > deadline
      )
        throw Error(
          `Owned comparison server failed: ${failure ?? server.stats().stderr}`,
        );
      if (editorURL) {
        try {
          if (
            (await fetch(editorURL, { signal: AbortSignal.timeout(1000) })).ok
          )
            break;
        } catch {
          /* Retry only the address reported by this owned child. */
        }
      }
      await Bun.sleep(100);
    }
    console.log(
      `Owned source checkout editor: ${editorURL}; process group ${server.child.pid}`,
    );
    for (const args of stages) {
      if (failure) throw failure;
      const started = performance.now();
      console.log(`Comparison stage starting: ${args[0]}`);
      stage = supervise(
        [process.execPath, ...args],
        {
          wallMilliseconds: Math.min(stageWallMilliseconds, 600000),
          rssKiB: 2097152,
          outputBytes: 2000000,
          onOutput: (bytes) => process.stdout.write(bytes),
        },
        {
          ...process.env,
          ...registry.env,
          MAPLE_COMPARISON_EDITOR_URL: editorURL,
        },
      );
      registry.record(stage.child.pid!);
      console.log(`Owned comparison stage group: ${stage.child.pid}`);
      scan = setInterval(() => {
        try {
          if (stage?.child.pid) registry.captureDescendants(stage.child.pid);
        } catch (error) {
          failure ||= error;
          stopStage("Comparison process inspection failed");
        }
      }, 100);
      try {
        await stage.done;
      } catch (error) {
        console.log(
          `Comparison stage failed: ${args[0]}; exit ${stage.child.exitCode ?? stage.child.signalCode}; elapsed ${Math.round(performance.now() - started)} ms`,
        );
        throw failure ?? error;
      } finally {
        clearInterval(scan);
        scan = undefined;
        clearTimeout(force);
        force = undefined;
      }
      console.log(
        `Comparison stage completed: ${args[0]}; exit 0; elapsed ${Math.round(performance.now() - started)} ms`,
      );
      stage = undefined;
      if (failure || server.child.exitCode !== null)
        throw failure ?? Error("Owned comparison server stopped");
    }
  } catch (error) {
    primaryFailure = error;
    throw error;
  } finally {
    closing = true;
    clearInterval(scan);
    clearTimeout(force);
    const cleanupDeadline = interruptionDeadline ?? performance.now() + 30000;
    const cleanupErrors: unknown[] = [];
    try {
      if (stage?.child.pid) registry.captureDescendants(stage.child.pid);
      if (server?.child.pid) registry.captureDescendants(server.child.pid);
    } catch (error) {
      cleanupErrors.push(error);
    }
    stage?.stop("Comparison finished");
    server?.stop("Comparison finished");
    try {
      const result = await registry.cleanup(cleanupDeadline);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          Promise.all([
            stage?.done.catch(() => {}),
            server?.done.catch(() => {}),
          ]),
          new Promise((_, reject) => {
            timer = setTimeout(
              () =>
                reject(
                  Error("Comparison process handles exceeded cleanup deadline"),
                ),
              Math.max(1, cleanupDeadline - performance.now()),
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
      console.log(
        "Comparison owned process cleanup: " + JSON.stringify(result),
      );
    } catch (error) {
      cleanupErrors.push(error);
    } finally {
      process.off("SIGINT", interrupt);
      process.off("SIGTERM", interrupt);
      try {
        registry.remove();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (cleanupErrors.length)
      throw new AggregateError(
        [...(primaryFailure ? [primaryFailure] : []), ...cleanupErrors],
        "Comparison execution/cleanup failed",
      );
  }
}

if (import.meta.main) {
  if (!process.argv.includes("--trust-native-fixture"))
    throw Error("Explicit native fixture opt-in required");
  const scene = process.argv.includes("--scene");
  await runComparison([
    ["tools/library-consumer.ts"],
    ["tools/library-preview-acceptance.ts"],
    [
      "prototypes/library-preview/native-stop-failure-test.ts",
      "--trust-native-fixture",
      ...(scene ? ["--scene"] : []),
    ],
    ...(scene
      ? [
          [
            "prototypes/library-preview/scene-compare.ts",
            "--trust-native-fixture",
          ],
          ["prototypes/library-preview/scene-comparison-report.ts"],
          ["prototypes/library-preview/scene-report-test.ts"],
        ]
      : [
          ["prototypes/library-preview/compare.ts", "--trust-native-fixture"],
          ["run", "build:web"],
          ["prototypes/library-preview/package-cost.ts"],
          ["prototypes/library-preview/comparison-report.ts"],
          ["prototypes/library-preview/report-test.ts"],
        ]),
  ]);
}
