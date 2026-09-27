/**
 * The orchestrator: state manager + loop manager, running in the background.
 * Each tick it folds the log into state, asks decide() what should happen, and
 * carries that out. It never plans and never writes product code — it runs the
 * agents that do, checks their work itself, and keeps every loop bounded.
 */
import fs from "node:fs";
import path from "node:path";
import { driverFor } from "./config";
import { decide, type Action } from "./decide";
import { onboardingGate, planGate } from "./gate";
import * as git from "./git";
import { matchesAny } from "./glob";
import { project } from "./project";
import * as roles from "./roles";
import { append, newJobId, paths, readEvents } from "./store";
import { subject } from "./types";
import type { Failure, Plan, ProjectState, Role } from "./types";
import { verifyPacket } from "./verify";

type JobOutcome = { ok: boolean; failure?: Failure; costUsd?: number; sessionId?: string };

const inflight = new Set<string>(); // dispatched this process, job.started may not be on disk yet
export const inflightCount = () => inflight.size;

export async function tick(pid: string): Promise<number> {
  const s = project(pid, readEvents(pid));
  let started = 0;
  for (const a of decide(s, Date.now())) {
    const key = JSON.stringify(a);
    if (inflight.has(key)) continue;
    inflight.add(key);
    started++;
    execute(pid, s, a)
      .catch((e) => append(pid, { type: "note", level: "warn", message: `Orchestrator error on ${a.kind}: ${(e as Error).message}` }))
      .finally(() => inflight.delete(key));
  }
  return started;
}

/** After a crash or restart: anything "running" on disk but not in this process is orphaned. */
export function reconcile(pid: string) {
  const s = project(pid, readEvents(pid));
  for (const j of Object.values(s.jobs)) {
    if (j.finishedAt) continue;
    append(pid, {
      type: "job.finished",
      jobId: j.jobId,
      ok: false,
      failure: { class: "internal", message: "The orchestrator restarted while this was running. It will be picked up again; work in its copy is kept." },
      durationMs: Date.now() - Date.parse(j.startedAt),
    });
  }
}

async function job(
  pid: string,
  meta: { role: Role; subject: string; attempt: number },
  fn: (jobId: string, logFile: string) => Promise<JobOutcome>,
) {
  const jobId = newJobId();
  const driver = meta.role === "orchestrator" ? "arrow" : driverFor(meta.role);
  append(pid, { type: "job.started", jobId, ...meta, driver });
  const t0 = Date.now();
  let r: JobOutcome;
  try {
    r = await fn(jobId, path.join(paths(pid).logs, `${jobId}.log`));
  } catch (e) {
    r = { ok: false, failure: { class: "internal", message: (e as Error).message } };
  }
  append(pid, { type: "job.finished", jobId, ok: r.ok, failure: r.failure, durationMs: Date.now() - t0, costUsd: r.costUsd, sessionId: r.sessionId });
}

const fromRun = (r: { failure?: Failure; exit: { costUsd?: number; sessionId?: string } }): JobOutcome => ({
  ok: !r.failure,
  failure: r.failure,
  costUsd: r.exit.costUsd,
  sessionId: r.exit.sessionId,
});

async function execute(pid: string, s: ProjectState, a: Action): Promise<void> {
  const P = paths(pid);
  const repo = s.repo?.path ?? P.repo;

  switch (a.kind) {
    case "clone":
      return job(pid, { role: "orchestrator", subject: subject.clone, attempt: a.attempt }, async () => {
        const c = await git.clone(s.repoUrl, P.repo, s.branch);
        append(pid, { type: "repo.cloned", path: P.repo, branch: c.branch, head: c.head });
        return { ok: true };
      });

    case "onboard":
      return job(pid, { role: "onboarder", subject: subject.onboard, attempt: a.attempt }, async (jobId, logFile) => {
        const r = await roles.onboarder({ jobId, logFile, feedback: a.feedback, input: { repoPath: repo, repoUrl: s.repoUrl, rulesText: s.rulesText } });
        if (r.result) append(pid, { type: "profile.ready", profile: r.result });
        return fromRun(r);
      });

    case "open_onboarding_gate":
      append(pid, { type: "gate.opened", gate: onboardingGate(s.profile!) });
      return;

    case "pm": {
      const t = s.tasks[a.taskId];
      return job(pid, { role: "pm", subject: subject.pm(a.taskId), attempt: a.attempt }, async (jobId, logFile) => {
        const r = await roles.pm({ jobId, logFile, cwd: repo, feedback: a.feedback, input: { task: t.text, profile: s.profile! } });
        if (r.result) append(pid, { type: "spec.ready", taskId: a.taskId, spec: r.result });
        return fromRun(r);
      });
    }

    case "architect": {
      const t = s.tasks[a.taskId];
      return job(pid, { role: "architect", subject: subject.architect(a.taskId), attempt: a.attempt }, async (jobId, logFile) => {
        const r = await roles.architect({
          jobId, logFile, cwd: repo, feedback: a.feedback,
          input: { taskId: a.taskId, task: t.text, spec: t.spec!, answers: t.answers ?? {}, profile: s.profile! },
        });
        if (!r.result) return fromRun(r);
        const problem = planProblem(r.result);
        if (problem) return { ...fromRun(r), ok: false, failure: { class: "bad_output", message: problem } };
        const branch = `arrow/${a.taskId.toLowerCase()}`;
        const base = await git.head(repo);
        await git.ensureBranch(repo, branch, base);
        append(pid, { type: "plan.ready", taskId: a.taskId, plan: r.result, branch, base });
        return fromRun(r);
      });
    }

    case "open_plan_gate": {
      const t = s.tasks[a.taskId];
      append(pid, { type: "gate.opened", gate: planGate(a.taskId, t.plan!, t.spec!, s.profile!.rules) });
      return;
    }

    case "work": {
      const t = s.tasks[a.taskId];
      const pk = t.packets[a.packetId].packet;
      return job(pid, { role: "worker", subject: subject.work(a.taskId, a.packetId), attempt: a.attempt }, async (jobId, logFile) => {
        const wt = await packetWorktree(pid, s, a.taskId, a.packetId);
        const r = await roles.worker({
          jobId, logFile, cwd: wt, resume: a.resume,
          input: { packet: pk, attempt: a.attempt, previous: a.previous, commands: s.profile!.commands, rules: s.profile!.rules.filter((x) => x.criticality === "critical") },
        });
        return fromRun(r);
      });
    }

    case "verify": {
      const t = s.tasks[a.taskId];
      const pv = t.packets[a.packetId];
      return job(pid, { role: "orchestrator", subject: subject.verify(a.taskId, a.packetId), attempt: pv.attempts }, async () => {
        const wt = await packetWorktree(pid, s, a.taskId, a.packetId);
        const v = await verifyPacket({ wt, base: t.branch!, packet: pv.packet, profile: s.profile!, attempt: pv.attempts, approvedProtected: approvedProtected(s, a.taskId, a.packetId) });
        append(pid, v.ok
          ? { type: "packet.verified", taskId: a.taskId, packetId: a.packetId, report: v.report, changedFiles: v.changedFiles }
          : { type: "packet.failed", taskId: a.taskId, packetId: a.packetId, failure: v.failure });
        return { ok: true };
      });
    }

    case "merge": {
      const t = s.tasks[a.taskId];
      const pv = t.packets[a.packetId];
      return job(pid, { role: "orchestrator", subject: subject.merge(a.taskId, a.packetId), attempt: 1 }, async () => {
        const wt = await packetWorktree(pid, s, a.taskId, a.packetId);
        const rb = await git.rebase(wt, t.branch!);
        if (!rb.ok) {
          append(pid, { type: "packet.failed", taskId: a.taskId, packetId: a.packetId, failure: { class: "merge", message: "It conflicts with work that already landed on this task's branch.", report: rb.out.trim().split("\n").slice(-20) } });
          return { ok: true };
        }
        // the first time this packet's code runs together with everyone else's
        const v = await verifyPacket({ wt, base: t.branch!, packet: pv.packet, profile: s.profile!, attempt: pv.attempts, approvedProtected: approvedProtected(s, a.taskId, a.packetId) });
        if (!v.ok) {
          append(pid, { type: "packet.failed", taskId: a.taskId, packetId: a.packetId, failure: { ...v.failure, class: "merge", message: `Passes alone, fails combined with landed work: ${v.failure.message}` } });
          return { ok: true };
        }
        const tip = await git.head(wt);
        await git.fastForward(repo, t.branch!, tip);
        append(pid, { type: "packet.merged", taskId: a.taskId, packetId: a.packetId, head: tip });
        await git.removeWorktree(repo, worktreeDir(pid, a.taskId, a.packetId), packetBranch(a.taskId, a.packetId));
        return { ok: true };
      });
    }

    case "repair": {
      const t = s.tasks[a.taskId];
      const pv = t.packets[a.packetId];
      return job(pid, { role: "architect", subject: subject.repair(a.taskId, a.packetId), attempt: a.attempt }, async (jobId, logFile) => {
        const r = await roles.repairer({ jobId, logFile, cwd: repo, input: { taskId: a.taskId, packet: pv.packet, failure: pv.lastFailure!, profile: s.profile! } });
        if (!r.result) return fromRun(r);
        if (r.result.id !== a.packetId)
          return { ...fromRun(r), ok: false, failure: { class: "bad_output", message: `The re-aimed packet must keep id ${a.packetId}.` } };
        append(pid, { type: "packet.repaired", taskId: a.taskId, packetId: a.packetId, packet: r.result, note: pv.lastFailure?.message ?? "" });
        return fromRun(r);
      });
    }

    case "land": {
      const t = s.tasks[a.taskId];
      const tip = await git.head(repo, `refs/heads/${t.branch}`);
      append(pid, { type: "task.landed", taskId: a.taskId, branch: t.branch!, head: tip });
      append(pid, { type: "note", level: "info", subject: a.taskId, message: `${a.taskId} landed on ${t.branch} (${tip.slice(0, 7)}). Nothing was pushed.` });
      return;
    }

    case "park":
      append(pid, { type: "step.parked", subject: a.subject, reason: a.reason });
      return;
  }
}

// ------------------------------------------------------------ helpers

const packetBranch = (t: string, p: string) => `arrow/${t.toLowerCase()}--${p.toLowerCase()}`;
const worktreeDir = (pid: string, t: string, p: string) => path.join(paths(pid).worktrees, `${t}--${p}`);

async function packetWorktree(pid: string, s: ProjectState, t: string, p: string) {
  const dir = worktreeDir(pid, t, p);
  if (fs.existsSync(path.join(dir, ".git"))) return dir;
  const repo = s.repo!.path;
  return git.worktree(repo, dir, packetBranch(t, p), await git.head(repo, `refs/heads/${s.tasks[t].branch}`));
}

/** Files a human saw at an approved plan check — protected, but approved for that packet. */
function approvedProtected(s: ProjectState, t: string, p: string): string[] {
  const task = s.tasks[t];
  if (!task.planGateId || s.gates[task.planGateId]?.decision !== "approve") return [];
  const original = task.plan?.packets.find((x) => x.id === p);
  if (!original) return [];
  const protectedGlobs = s.profile!.rules.filter((r) => r.criticality === "critical").flatMap((r) => r.protectedPaths);
  return original.files.filter((f) => matchesAny(f, protectedGlobs));
}

/** Checks a model can get wrong but code can prove: unique ids, real deps, no cycles. */
export function planProblem(plan: Plan): string | undefined {
  const ids = plan.packets.map((p) => p.id);
  const dup = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dup) return `Packet id ${dup} is used twice.`;
  for (const p of plan.packets) {
    if (!/^[A-Za-z0-9-]+$/.test(p.id)) return `Packet id "${p.id}" may only use letters, digits and dashes.`;
    const missing = p.deps.find((d) => !ids.includes(d));
    if (missing) return `${p.id} depends on ${missing}, which is not in the plan.`;
  }
  const deps = new Map(plan.packets.map((p) => [p.id, p.deps]));
  const seen = new Set<string>();
  const stack = new Set<string>();
  const cyclic = (id: string): boolean => {
    if (stack.has(id)) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    stack.add(id);
    const hit = (deps.get(id) ?? []).some(cyclic);
    stack.delete(id);
    return hit;
  };
  const loop = ids.find(cyclic);
  return loop ? `The packet dependencies loop back on themselves (through ${loop}).` : undefined;
}
