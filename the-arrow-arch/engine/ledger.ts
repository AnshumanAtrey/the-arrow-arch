/**
 * The shared ledger: what is going on right now, across every agent. Nobody but
 * the orchestrator writes it — it is rebuilt from two sources each time:
 *   expected  the event log (which jobs run, which packets own which worktree)
 *   observed  the operating system (processes, their folders, listening ports, git worktrees)
 * Anything Arrow owns that no live job accounts for is stale, and gets reaped.
 * Pure: snapshot in, ledger out. The scan and the reaping live in ledger-scan.ts.
 */
import path from "node:path";
import type { HouseSettings } from "./house-rules";
import type { JobView, PacketStatus, ProjectState } from "./types";

export type OsSnapshot = {
  procs: { pid: number; pgid: number; command: string }[];
  listening: { pid: number; port: number }[];
  cwds: Record<number, string>;
  worktrees: { path: string; branch?: string }[];
  selfPid: number;
};

export type Ledger = {
  at: string;
  agents: { jobId: string; role: string; subject: string; packet?: string; pid?: number; port?: number; since: string; files: string[] }[];
  worktrees: { path: string; branch?: string; packet?: string; status: "in use" | "kept" | "stale"; why?: string }[];
  services: { port: number; pid: number; command: string; owner: string; stale: boolean }[];
  stale: { kind: "process" | "worktree"; what: string; why: string; pgid?: number; path?: string; branch?: string }[];
};

const ACTIVE: PacketStatus[] = ["preparing", "prepared", "working", "built", "verifying", "verified", "merging"];

export function buildLedger(s: ProjectState, os: OsSnapshot, dirs: { project: string; worktrees: string }, at: string): Ledger {
  const running = Object.values(s.jobs).filter((j) => !j.finishedAt);
  const byPgid = new Map<number, JobView>();
  for (const j of Object.values(s.jobs)) if (j.pid) byPgid.set(j.pid, j);
  const packetOfDir = (p: string) => {
    const rel = path.relative(dirs.worktrees, p);
    if (rel.startsWith("..") || path.isAbsolute(rel)) return undefined;
    const [t, pk] = rel.split(path.sep)[0].split("--");
    return t && pk ? { taskId: t, packetId: pk } : undefined;
  };
  const packetView = (t: string, p: string) => s.tasks[t]?.packets[p];
  const packetBusy = (t: string, p: string) => {
    const v = packetView(t, p);
    return Boolean(v && ACTIVE.includes(v.status) && !["landed", "halted"].includes(s.tasks[t].stage));
  };

  const agents = running.map((j) => {
    const [t, p] = j.subject.split(":");
    const pv = p ? packetView(t, p) : undefined;
    return { jobId: j.jobId, role: j.role, subject: j.subject, packet: pv ? `${t}/${p}` : undefined, pid: j.pid, port: j.port, since: j.startedAt, files: pv && j.role === "worker" ? pv.packet.files : [] };
  });

  // processes: ours if their group is an Arrow job, or they live in a folder Arrow made
  const stale: Ledger["stale"] = [];
  const ownerOf = new Map<number, { owner: string; stale: boolean; why?: string }>();
  for (const pr of os.procs) {
    if (pr.pid === os.selfPid) continue;
    const job = byPgid.get(pr.pgid);
    const cwd = os.cwds[pr.pid];
    const inProject = Boolean(cwd && cwd.startsWith(dirs.project + path.sep));
    let verdict: { owner: string; stale: boolean; why?: string } | undefined;
    if (job && !job.finishedAt) {
      verdict = { owner: job.subject, stale: false };
    } else if (job && inProject) {
      // a process id can be reused by the OS, so a finished job's group counts only inside Arrow's folders
      verdict = { owner: job.subject, stale: true, why: `its ${job.role} run ended ${job.finishedAt}` };
    } else if (inProject && cwd) {
      const pk = packetOfDir(cwd);
      const live = pk ? packetBusy(pk.taskId, pk.packetId) || running.some((j) => j.subject.startsWith(`${pk.taskId}:${pk.packetId}:`)) : running.length > 0;
      verdict = live ? { owner: pk ? `${pk.taskId}/${pk.packetId}` : "project", stale: false } : { owner: pk ? `${pk.taskId}/${pk.packetId}` : "project", stale: true, why: "nothing Arrow runs owns it any more" };
    }
    if (!verdict) continue; // not Arrow's — never touched
    ownerOf.set(pr.pid, verdict);
    if (verdict.stale && !stale.some((x) => x.pgid === pr.pgid))
      stale.push({ kind: "process", what: `${pr.command} (pid ${pr.pid})`, why: verdict.why ?? "orphaned", pgid: pr.pgid });
  }

  const services = os.listening.map((l) => {
    const pr = os.procs.find((p) => p.pid === l.pid);
    const o = ownerOf.get(l.pid);
    return { port: l.port, pid: l.pid, command: pr?.command ?? "?", owner: o?.owner ?? "outside Arrow", stale: o?.stale ?? false };
  });

  const worktrees: Ledger["worktrees"] = [];
  for (const w of os.worktrees) {
    const pk = packetOfDir(w.path);
    if (!pk) continue; // the main clone
    const v = packetView(pk.taskId, pk.packetId);
    const stage = s.tasks[pk.taskId]?.stage;
    const name = `${pk.taskId}/${pk.packetId}`;
    if (!v || v.status === "merged" || stage === "landed" || stage === "halted") {
      const why = !v ? "no packet owns it" : v.status === "merged" ? "its packet already landed" : `its task is ${stage}`;
      worktrees.push({ path: w.path, branch: w.branch, packet: name, status: "stale", why });
      stale.push({ kind: "worktree", what: name, why, path: w.path, branch: v?.status === "merged" || !v ? w.branch : undefined });
    } else worktrees.push({ path: w.path, branch: w.branch, packet: name, status: packetBusy(pk.taskId, pk.packetId) ? "in use" : "kept" });
  }
  return { at, agents, worktrees, services, stale };
}

/** The port range a worker slot owns. */
export const portRange = (slot: number, h: HouseSettings["ports"]) => [h.base + slot * h.perWorker, h.base + (slot + 1) * h.perWorker - 1] as const;

/** Lowest slot whose whole range is free of running workers and of anything listening. */
export function freeSlot(l: Ledger, h: HouseSettings["ports"], taken: number[]): number {
  for (let slot = 0; slot < 1000; slot++) {
    const [lo, hi] = portRange(slot, h);
    // a stale server still holds its port until the reaper stops it, so it counts as busy
    const busy = taken.some((p) => p >= lo && p <= hi) || l.services.some((sv) => sv.port >= lo && sv.port <= hi);
    if (!busy) return slot;
  }
  return 0;
}

/** What a worker is told when it starts: who else is working, on what, and on which ports. */
export function ledgerBrief(l: Ledger, me: { packet: string; port: number; h: HouseSettings["ports"] }): string {
  const others = l.agents.filter((a) => a.packet && a.packet !== me.packet);
  const lo = me.port;
  const hi = me.port + me.h.perWorker - 1;
  const lines = [
    "# Who else is working right now",
    "",
    "Arrow's orchestrator keeps a ledger of every agent, worktree and local server. It is",
    "read-only: you don't edit it, you don't need to — it updates itself from what runs.",
    "",
    `You are the worker for ${me.packet}, in your own worktree.`,
    others.length ? `${others.length} other agent(s) are running beside you:` : "No other agent is running beside you right now.",
    ...others.map((a) => `  - ${a.packet} (${a.role})${a.files.length ? ` — may change: ${a.files.join(", ")}` : ""}`),
    "",
    `Your ports are ${lo}–${hi}; PORT=${lo} is set for you. Start any local server on those, never on others.`,
    // Arrow's own servers by owner; the rest of the machine's ports on one line — every worker prompt carries this
    ...l.services.filter((sv) => sv.owner !== "outside Arrow").map((sv) => `  - port ${sv.port} is ${sv.owner}'s`),
    ...(l.services.some((sv) => sv.owner === "outside Arrow")
      ? [`Taken by other programs on this machine: ${[...new Set(l.services.filter((sv) => sv.owner === "outside Arrow").map((sv) => sv.port))].sort((a, b) => a - b).join(", ")}.`]
      : []),
    "Don't stop or restart processes you didn't start. Anything you leave running is cleaned up when you finish.",
  ];
  return lines.join("\n");
}
