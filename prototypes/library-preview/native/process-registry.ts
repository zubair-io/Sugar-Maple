import {
  appendFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const registryKey = "MAPLE_COMPARISON_PROCESS_REGISTRY";
type Record = { group: number; uid: number; started: string | null };
function processes() {
  const ps = Bun.spawnSync([
    "/bin/ps",
    "-axo",
    "pid=,ppid=,pgid=,uid=,stat=,lstart=",
  ]);
  if (ps.exitCode) throw Error("Owned comparison process inspection failed");
  return ps.stdout
    .toString()
    .trim()
    .split("\n")
    .map((line) => {
      const [pid, parent, group, uid, state, ...start] = line
        .trim()
        .split(/\s+/);
      return {
        pid: Number(pid),
        parent: Number(parent),
        group: Number(group),
        uid: Number(uid),
        state,
        started: start.join(" "),
      };
    });
}
function record(path: string, group: number) {
  const leader = processes().find((p) => p.pid === group);
  appendFileSync(
    path,
    JSON.stringify({
      group,
      uid: process.getuid!(),
      started: leader?.started ?? null,
    }) + "\n",
  );
}

// This journal belongs to fixed trusted comparison commands. NativePreview's
// restricted child environment stays unchanged; its unsandboxed supervisor
// registers the detached helper before handing control back to the event loop.
export function registerComparisonProcess(group: number, stop: () => void) {
  const path = process.env[registryKey];
  if (!path) return () => {};
  record(path, group);
  const interrupted = () => stop();
  process.on("SIGINT", interrupted);
  process.on("SIGTERM", interrupted);
  return () => {
    process.off("SIGINT", interrupted);
    process.off("SIGTERM", interrupted);
  };
}

export function comparisonProcessRegistry() {
  const directory = mkdtempSync(join(tmpdir(), "maple-comparison-processes-"));
  const path = join(directory, "groups.jsonl");
  writeFileSync(path, "", { mode: 0o600 });
  const captured = new Set<number>();
  return {
    env: { [registryKey]: path },
    record: (group: number) => record(path, group),
    captureDescendants(parent: number) {
      const rows = processes(),
        descendants = new Set([parent]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const row of rows)
          if (descendants.has(row.parent) && !descendants.has(row.pid)) {
            descendants.add(row.pid);
            changed = true;
          }
      }
      for (const row of rows)
        if (descendants.has(row.pid) && !captured.has(row.group)) {
          if (row.uid !== process.getuid!())
            throw Error("Comparison descendant changed user");
          captured.add(row.group);
          record(path, row.group);
        }
    },
    async cleanup(deadline = performance.now() + 30000) {
      const records: Record[] = readFileSync(path, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      const groups = new Map(records.map((item) => [item.group, item]));
      while (true) {
        const rows = processes(),
          live = rows.filter(
            (p) => groups.has(p.group) && !p.state.startsWith("Z"),
          );
        if (!live.length) return { groups: [...groups.keys()], live: [] };
        for (const [group, item] of groups) {
          const members = live.filter((p) => p.group === group);
          if (!members.length) continue;
          const leader = rows.find((p) => p.pid === group);
          if (
            members.some((p) => p.uid !== item.uid) ||
            (leader && leader.started !== item.started)
          )
            throw Error(
              "Owned comparison process identity changed; refusing to signal group " +
                group,
            );
          try {
            process.kill(-group, "SIGKILL");
          } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code !== "ESRCH" && code !== "EPERM") throw error;
            // Darwin can deny a group signal during process teardown. A denial
            // is never success: poll within the same deadline, revalidating
            // UID/start identity before every retry and requiring no live member.
          }
        }
        if (performance.now() > deadline)
          throw Error(
            "Owned comparison descendants survived the 30-second cleanup deadline",
          );
        await Bun.sleep(100);
      }
    },
    remove: () => rmSync(directory, { recursive: true }),
  };
}
