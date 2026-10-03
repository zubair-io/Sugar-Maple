import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { registerComparisonProcess } from "./process-registry";

export interface Budget {
  wallMilliseconds: number;
  rssKiB: number;
  outputBytes: number;
  signal?: AbortSignal;
  onOutput?: (bytes: Buffer) => void;
}
// All callers provide fixed owned-fixture commands. No shell and no protocol
// command reaches this interface. Detached groups isolate cancellation scope.
export function supervise(
  command: string[],
  budget: Budget,
  env?: NodeJS.ProcessEnv,
) {
  if (budget.signal?.aborted) throw Error("Operation cancelled");
  const child: ChildProcessWithoutNullStreams = spawn(
    command[0],
    command.slice(1),
    {
      detached: true,
      stdio: "pipe",
      env,
    },
  );
  let reason = "",
    bytes = 0,
    maxRSSKiB = 0,
    scanning = false,
    closed = false;
  let stderr = "";
  const stop = (why = "Operation cancelled") => {
    if (closed) return;
    reason ||= why;
    if (child.pid) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    }
  };
  const abort = () => stop();
  let unregister = () => {};
  try {
    if (child.pid) unregister = registerComparisonProcess(child.pid, stop);
  } catch (error) {
    stop("Owned process registration failed");
    throw error;
  }
  budget.signal?.addEventListener("abort", abort, { once: true });
  const deadline = setTimeout(
    () => stop("Wall-time budget exceeded"),
    budget.wallMilliseconds,
  );
  const monitor = setInterval(async () => {
    if (closed || scanning || !child.pid) return;
    scanning = true;
    try {
      const ps = Bun.spawn(["/bin/ps", "-axo", "pid=,pgid=,rss="], {
        stdout: "pipe",
        stderr: "ignore",
      });
      const text = await new Response(ps.stdout).text();
      if (await ps.exited) {
        stop("Resource inspection failed");
        return;
      }
      const total = text
        .trim()
        .split("\n")
        .reduce((sum, line) => {
          const [, group, rss] = line.trim().split(/\s+/).map(Number);
          return group === child.pid ? sum + rss : sum;
        }, 0);
      maxRSSKiB = Math.max(maxRSSKiB, total);
      if (total > budget.rssKiB) stop("Resident-memory budget exceeded");
    } catch {
      stop("Resource inspection failed");
    } finally {
      scanning = false;
    }
  }, 100);
  function account(chunk: Buffer) {
    bytes += chunk.length;
    if (bytes > budget.outputBytes) {
      stop("Output budget exceeded");
      return false;
    }
    return true;
  }
  child.stdout.on("data", (chunk) => {
    if (account(chunk)) budget.onOutput?.(chunk);
  });
  child.stderr.on("data", (chunk) => {
    if (account(chunk)) stderr += chunk.toString();
  });
  const done = new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
    maxRSSKiB: number;
    bytes: number;
  }>((resolve, reject) => {
    const cleanup = () => {
      closed = true;
      clearTimeout(deadline);
      clearInterval(monitor);
      budget.signal?.removeEventListener("abort", abort);
      unregister();
    };
    child.once("error", (error) => {
      cleanup();
      reject(error);
    });
    child.once("close", (code, signal) => {
      cleanup();
      if (reason) reject(Error(reason));
      else if (code !== 0)
        reject(
          Error(
            `Owned process failed (${code ?? signal}): ${stderr.slice(0, 2000)}`,
          ),
        );
      else resolve({ code, signal, maxRSSKiB, bytes });
    });
  });
  // A caller may await a protocol reply first; prevent premature unhandled rejection.
  void done.catch(() => {});
  return { child, done, stop, stats: () => ({ maxRSSKiB, bytes, stderr }) };
}
