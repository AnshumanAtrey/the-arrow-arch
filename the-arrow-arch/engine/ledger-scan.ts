/**
 * The impure half of the ledger: look at the machine, rebuild the ledger, write
 * it for the UI, and reap what is stale. Only the orchestrator calls this.
 */
import fs from "node:fs";
import path from "node:path";
import * as git from "./git";
import { buildLedger, type Ledger, type OsSnapshot } from "./ledger";
import { killGroup, run } from "./proc";
import { project } from "./project";
import { append, paths, readEvents } from "./store";
import type { ProjectState } from "./types";

async function scanOs(repo: string | undefined): Promise<OsSnapshot> {
  const procs: OsSnapshot["procs"] = [];
  const ps = await run("ps", ["-A", "-o", "pid=,pgid=,comm="], { timeoutMs: 10_000 });
  for (const line of ps.out.split("\n")) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
    if (m) procs.push({ pid: Number(m[1]), pgid: Number(m[2]), command: path.basename(m[3]) });
  }
  const listening: OsSnapshot["listening"] = [];
  const ls = await run("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-F", "pn"], { timeoutMs: 10_000 });
  let pid = 0;
  for (const line of ls.out.split("\n")) {
    if (line.startsWith("p")) pid = Number(line.slice(1));
    else if (line.startsWith("n")) {
      const port = Number(line.split(":").pop());
      if (pid && port && !listening.some((l) => l.pid === pid && l.port === port)) listening.push({ pid, port });
    }
  }
  const cwds: OsSnapshot["cwds"] = {};
  const cw = await run("lsof", ["-a", "-d", "cwd", "-F", "pn"], { timeoutMs: 15_000, maxBytes: 5_000_000 });
  pid = 0;
  for (const line of cw.out.split("\n")) {
    if (line.startsWith("p")) pid = Number(line.slice(1));
    else if (line.startsWith("n") && pid) cwds[pid] = line.slice(1);
  }
  const worktrees = repo && fs.existsSync(repo) ? await git.listWorktrees(repo).catch(() => []) : [];
  return { procs, listening, cwds, worktrees, selfPid: process.pid };
}

const ledgerFile = (pid: string) => path.join(paths(pid).dir, "ledger.json");
/** Never reap a worktree that changed in the last 30 s — something may be mid-step in it. */
const settled = (p: string) => {
  try {
    return Date.now() - fs.statSync(p).mtimeMs > 30_000;
  } catch {
    return true;
  }
};
const real = (p: string) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
};

export function readLedger(pid: string): Ledger | null {
  try {
    return JSON.parse(fs.readFileSync(ledgerFile(pid), "utf8"));
  } catch {
    return null;
  }
}

/**
 * Rebuild the ledger from what is really there, and clean up: stale process
 * groups get SIGTERM (SIGKILL if they're still there next time), stale worktrees
 * are removed. Every reap is recorded in the event log.
 */
export async function refreshLedger(pid: string, hint: ProjectState, reap = true): Promise<Ledger> {
  const P = paths(pid);
  const before = readLedger(pid);
  const os = await scanOs(hint.repo?.path);
  // read the state AFTER the scan: everything the scan saw was already logged, so a
  // worktree or process that appeared mid-scan is never mistaken for an orphan
  const s = project(pid, readEvents(pid));
  // the OS reports real paths (/private/var/..., not /var/...): compare like with like
  os.worktrees = os.worktrees.map((w) => ({ ...w, path: real(w.path) }));
  const dirs = { project: real(P.dir), worktrees: path.join(real(P.dir), path.basename(P.worktrees)) };
  const ledger = buildLedger(s, os, dirs, new Date().toISOString());

  if (reap && ledger.stale.length) {
    const items: { kind: "process" | "worktree"; what: string; why: string }[] = [];
    for (const st of ledger.stale) {
      if (st.kind === "process" && st.pgid) {
        const again = before?.stale.some((b) => b.kind === "process" && b.pgid === st.pgid);
        killGroup(st.pgid, again ? "SIGKILL" : "SIGTERM");
        items.push({ kind: "process", what: st.what, why: st.why });
      } else if (st.kind === "worktree" && st.path && s.repo && st.path.startsWith(dirs.worktrees + path.sep) && settled(st.path)) {
        await git.removeWorktree(s.repo.path, st.path, st.branch ?? "");
        if (fs.existsSync(st.path)) fs.rmSync(st.path, { recursive: true, force: true });
        await git.pruneWorktrees(s.repo.path);
        items.push({ kind: "worktree", what: st.what, why: st.why });
      }
    }
    if (items.length) append(pid, { type: "ledger.reaped", items });
  }
  fs.writeFileSync(ledgerFile(pid), JSON.stringify(ledger, null, 1));
  return ledger;
}
