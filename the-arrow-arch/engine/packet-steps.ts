/**
 * One packet's life, run by the orchestrator: prepare its worktree, run its
 * worker (told who else is working and on which ports), verify, merge, re-aim.
 */
import fs from "node:fs";
import path from "node:path";
import type { Action } from "./decide";
import * as git from "./git";
import { matchesAny } from "./glob";
import { effectiveSettings } from "./house-rules";
import { fromRun, job } from "./jobs";
import { freeSlot, ledgerBrief, portRange } from "./ledger";
import { readLedger, refreshLedger } from "./ledger-scan";
import { acceptTask } from "./accept";
import { planProblem } from "./plan-check";
import { preparePacket } from "./prepare";
import { scrubbedEnv } from "./proc";
import * as roles from "./roles";
import { append, paths } from "./store";
import { subject } from "./types";
import type { Packet, ProjectState } from "./types";
import { NO_PRODUCTION_NOTE, verifyPacket } from "./verify";

type PacketAction = Extract<Action, { kind: "prepare" | "work" | "verify" | "merge" | "repair" | "accept" | "complete" | "phase" | "land" }>;

export const packetBranch = (t: string, p: string) => `arrow/${t.toLowerCase()}--${p.toLowerCase()}`;
export const worktreeDir = (pid: string, t: string, p: string) => path.join(paths(pid).worktrees, `${t}--${p}`);

const houseOf = (s: ProjectState) =>
  effectiveSettings(s.profile!.houseRules, Boolean(s.onboardingGateId && s.gates[s.onboardingGateId]?.decision === "approve"));

/** Checks and installs get the basics, the variables the profile lists, and the packet's own. */
const commandEnv = (s: ProjectState, extra: string[] = [], port?: number) =>
  scrubbedEnv([...s.profile!.envVars.map((v) => v.name), ...extra], port ? { PORT: String(port) } : {});

export async function runPacketStep(pid: string, s: ProjectState, a: PacketAction): Promise<void> {
  const repo = s.repo!.path;
  const t = s.tasks[a.taskId];
  const house = houseOf(s);

  if (a.kind === "land") {
    const tip = await git.head(repo, `refs/heads/${t.branch}`);
    const stacked = await git.advanceIntegration(repo, t.branch!);
    append(pid, { type: "task.landed", taskId: a.taskId, branch: t.branch!, head: tip });
    append(pid, {
      type: "note", level: stacked ? "info" : "warn", subject: a.taskId,
      message: stacked
        ? `${a.taskId} landed on ${t.branch} (${tip.slice(0, 7)}); ${git.INTEGRATION} now includes it. Nothing was pushed.`
        : `${a.taskId} landed on ${t.branch} (${tip.slice(0, 7)}), but ${git.INTEGRATION} moved meanwhile, so it stays on its own branch.`,
    });
    return;
  }

  if (a.kind === "accept")
    return job(pid, { role: "orchestrator", subject: subject.accept(a.taskId), attempt: 1 }, async () => {
      // a packet that changed only tests cannot be proven by behaviour: carry its
      // NOTE into the acceptance report, where the person landing decides
      const notes = t.order
        .filter((id) => t.packets[id].report?.some((l) => l.includes(NO_PRODUCTION_NOTE)))
        .map((id) => `${id}: ${NO_PRODUCTION_NOTE}`);
      const r = await acceptTask({
        repo, branch: t.branch!, dir: path.join(paths(pid).dir, "accept", a.taskId), spec: t.spec!,
        setup: s.profile!.commands.setup, env: commandEnv(s), notes,
      });
      append(pid, r.ok
        ? { type: "task.accepted", taskId: a.taskId, report: r.report }
        : { type: "task.unaccepted", taskId: a.taskId, report: r.report, failures: r.failures });
      return { ok: true };
    });

  // the architect reads the task as it stands — its own branch, not arrow/main, which it hasn't reached yet
  const snapshot = (use: (dir: string) => Promise<ReturnType<typeof fromRun>>) =>
    git.withSnapshot(repo, path.join(paths(pid).dir, "snapshots", a.taskId), t.branch!, use);

  if (a.kind === "complete")
    return job(pid, { role: "architect", subject: subject.complete(a.taskId), attempt: a.attempt }, (ctx) => snapshot(async (cwd) => {
      const r = await roles.completer({
        ...ctx, cwd, env: scrubbedEnv(), feedback: a.feedback,
        input: {
          taskId: a.taskId, spec: t.spec!, failures: t.acceptance?.failures ?? [], report: t.acceptance?.report ?? [],
          landedPackets: t.order.map((id) => t.packets[id].packet), profile: s.profile!, house, knowledge: s.knowledge,
        },
      });
      if (!r.result) return fromRun(r);
      const problem = followUpProblem(t, r.result.packets);
      if (problem) return { ...fromRun(r), ok: false, failure: { class: "bad_output", message: problem } };
      await git.ensureIntegration(repo);
      append(pid, { type: "plan.extended", taskId: a.taskId, packets: r.result.packets, reason: `Closing the gap to the spec: ${(t.acceptance?.failures ?? []).join("; ")}`, by: "completion" });
      return fromRun(r);
    }));

  if (a.kind === "phase")
    return job(pid, { role: "architect", subject: subject.phase(a.taskId), attempt: a.attempt }, (ctx) => snapshot(async (cwd) => {
      const ahead = t.plan!.nextPhases;
      const r = await roles.architect({
        // the session that planned phase 1 plans phase 2: it already knows the repo
        ...ctx, cwd, env: scrubbedEnv(), feedback: a.feedback, resume: s.sessions[subject.architect(a.taskId)],
        input: {
          taskId: a.taskId, task: t.text, spec: t.spec!, answers: t.answers ?? {}, profile: s.profile!, house, knowledge: s.knowledge,
          phase: { number: t.phase + 1, landed: t.order.map((id) => t.packets[id].packet), ahead, note: a.human },
        },
      });
      if (!r.result) return fromRun(r);
      const problem = followUpProblem(t, r.result.packets);
      if (problem) return { ...fromRun(r), ok: false, failure: { class: "bad_output", message: problem } };
      append(pid, { type: "plan.extended", taskId: a.taskId, packets: r.result.packets, reason: `Phase ${t.phase + 1}: ${ahead[0]}`, by: "phase", nextPhases: r.result.nextPhases });
      return fromRun(r);
    }));

  const pv = t.packets[a.packetId];
  const dir = worktreeDir(pid, a.taskId, a.packetId);
  const verifyOpts = (wt: string) => ({
    wt, base: t.branch!, packet: pv.packet, profile: s.profile!, house, attempt: pv.attempts, baseline: pv.baseline ?? {},
    env: commandEnv(s, pv.packet.env, lastPort(s, a.taskId, a.packetId)), approvedProtected: approvedProtected(s, a.taskId, a.packetId),
  });

  switch (a.kind) {
    case "prepare":
      return job(pid, { role: "orchestrator", subject: subject.prepare(a.taskId, a.packetId), attempt: pv.repairs + 1 }, async () => {
        const from = await git.head(repo, `refs/heads/${t.branch}`);
        const r = await preparePacket({ repo, dir, branch: packetBranch(a.taskId, a.packetId), from, packet: pv.packet, profile: s.profile!, house, env: commandEnv(s, pv.packet.env) });
        append(pid, r.ok
          ? { type: "worktree.ready", taskId: a.taskId, packetId: a.packetId, path: dir, baseline: r.baseline }
          : { type: "packet.failed", taskId: a.taskId, packetId: a.packetId, failure: r.failure });
        return { ok: true };
      });

    case "work": {
      // the live picture, so this worker knows who else is working and which ports are free
      const ledger = readLedger(pid) ?? (await refreshLedger(pid, s, false));
      const taken = Object.values(s.jobs).filter((j) => !j.finishedAt && j.port).map((j) => j.port!);
      const [port] = portRange(freeSlot(ledger, house.ports, taken), house.ports);
      const brief = ledgerBrief(ledger, { packet: `${a.taskId}/${a.packetId}`, port, h: house.ports });
      return job(pid, { role: "worker", subject: subject.work(a.taskId, a.packetId), attempt: a.attempt, port }, async (ctx) => {
        const r = await roles.worker({
          ...ctx, cwd: pv.worktree ?? dir, resume: a.resume, preface: brief,
          env: scrubbedEnv(pv.packet.env, { PORT: String(port) }),
          input: {
            packet: pv.packet, attempt: a.attempt, previous: a.previous, commands: s.profile!.commands, versions: s.profile!.dependencies,
            rules: s.profile!.rules.filter((x) => x.criticality === "critical"), house, beside: besideOf(t, a.packetId),
            decisions: s.knowledge.filter((k) => k.kind === "decision").map((k) => k.text).slice(-30),
          },
        });
        if (r.result?.newFacts.length)
          append(pid, { type: "knowledge.recorded", entries: r.result.newFacts.map((text) => ({ kind: "fact" as const, text, source: `${a.taskId}/${a.packetId} worker` })) });
        // a worker that stops and says why is doing its job: the packet's aim needs fixing
        // only a person can give it (a key, access, a decision): wait for them, don't spend a re-aim on it
        if (r.result?.status === "blocked" && r.result.needsYou.trim())
          return { ...fromRun(r), ok: false, failure: { class: "environment", message: `Only you can provide this: ${r.result.needsYou.trim()}` } };
        if (r.result?.status === "blocked")
          return { ...fromRun(r), ok: false, failure: { class: "scope", message: `The worker stopped: ${r.result.blockedReason || "it needs something outside its packet"}.` } };
        return fromRun(r);
      });
    }

    case "verify":
      return job(pid, { role: "orchestrator", subject: subject.verify(a.taskId, a.packetId), attempt: pv.attempts }, async () => {
        const v = await verifyPacket(verifyOpts(pv.worktree ?? dir));
        append(pid, v.ok
          ? { type: "packet.verified", taskId: a.taskId, packetId: a.packetId, report: v.report, changedFiles: v.changedFiles }
          : { type: "packet.failed", taskId: a.taskId, packetId: a.packetId, failure: v.failure });
        return { ok: true };
      });

    case "merge":
      return job(pid, { role: "orchestrator", subject: subject.merge(a.taskId, a.packetId), attempt: 1 }, async () => {
        const wt = pv.worktree ?? dir;
        const rb = await git.rebase(wt, t.branch!);
        if (!rb.ok) {
          append(pid, { type: "packet.failed", taskId: a.taskId, packetId: a.packetId, failure: { class: "merge", message: "It conflicts with work that already landed on this task's branch.", report: rb.out.trim().split("\n").slice(-20) } });
          return { ok: true };
        }
        // the first time this packet's code runs together with everyone else's
        const v = await verifyPacket(verifyOpts(wt));
        if (!v.ok) {
          append(pid, { type: "packet.failed", taskId: a.taskId, packetId: a.packetId, failure: { ...v.failure, class: v.failure.class === "environment" ? "environment" : "merge", message: `Passes alone, fails combined with landed work: ${v.failure.message}` } });
          return { ok: true };
        }
        const tip = await git.head(wt);
        await git.fastForward(repo, t.branch!, tip);
        append(pid, { type: "packet.merged", taskId: a.taskId, packetId: a.packetId, head: tip });
        await git.removeWorktree(repo, wt, packetBranch(a.taskId, a.packetId));
        return { ok: true };
      });

    case "repair":
      return job(pid, { role: "architect", subject: subject.repair(a.taskId, a.packetId), attempt: a.attempt }, async (ctx) => {
        const r = await roles.repairer({
          ...ctx, cwd: repo, env: scrubbedEnv(),
          input: { taskId: a.taskId, packet: pv.packet, failure: pv.lastFailure!, profile: s.profile!, house, knowledge: s.knowledge, otherPacketIds: t.order },
        });
        if (!r.result) return fromRun(r);
        if (r.result.packet.id !== a.packetId)
          return { ...fromRun(r), ok: false, failure: { class: "bad_output", message: `The re-aimed packet must keep id ${a.packetId}.` } };
        const problem = followUpProblem(t, r.result.followUps);
        if (problem) return { ...fromRun(r), ok: false, failure: { class: "bad_output", message: problem } };
        // a new aim gets a clean shot: the old worktree goes, the next prepare re-checks red-first
        const wt = pv.worktree ?? dir;
        if (fs.existsSync(wt)) await git.removeWorktree(repo, wt, packetBranch(a.taskId, a.packetId));
        append(pid, { type: "packet.repaired", taskId: a.taskId, packetId: a.packetId, packet: r.result.packet, note: pv.lastFailure?.message ?? "" });
        // what the re-aim took out of the packet becomes its own packets — never dropped
        if (r.result.followUps.length)
          append(pid, { type: "plan.extended", taskId: a.taskId, packets: r.result.followUps, reason: `Split from ${a.packetId}: ${pv.lastFailure?.message ?? ""}`, by: "reaim", from: a.packetId });
        return fromRun(r);
      });
  }
}

/** New packets must fit the plan they join: fresh ids, real deps, no loops. */
function followUpProblem(t: ProjectState["tasks"][string], packets: Packet[]): string | undefined {
  const clash = packets.find((p) => t.packets[p.id]);
  if (clash) return `Packet id ${clash.id} is already in the plan — follow-ups need new ids.`;
  return planProblem({ ...t.plan!, packets: [...t.order.map((id) => t.packets[id].packet), ...packets] });
}

/** Packets of the same task that may be running at the same time (neither waits on the other). */
function besideOf(t: ProjectState["tasks"][string], me: string) {
  const after = (a: string, b: string, seen = new Set<string>()): boolean =>
    !seen.has(a) && (t.packets[a]?.packet.deps ?? []).some((d) => d === b || after(d, b, seen.add(a)));
  return t.order
    .filter((id) => id !== me && !after(me, id) && !after(id, me) && t.packets[id].status !== "merged")
    .map((id) => ({ id, title: t.packets[id].packet.title, files: t.packets[id].packet.files }));
}

const lastPort = (s: ProjectState, t: string, p: string) =>
  Object.values(s.jobs).filter((j) => j.subject === subject.work(t, p) && j.port).at(-1)?.port;

/** Files a human saw at an approved plan check — protected, but approved for that packet. */
function approvedProtected(s: ProjectState, t: string, p: string): string[] {
  const task = s.tasks[t];
  if (!task.planGateId || s.gates[task.planGateId]?.decision !== "approve") return [];
  const original = task.plan?.packets.find((x) => x.id === p);
  if (!original) return [];
  const protectedGlobs = s.profile!.rules.filter((r) => r.criticality === "critical").flatMap((r) => r.protectedPaths);
  return original.files.filter((f) => matchesAny(f, protectedGlobs));
}
