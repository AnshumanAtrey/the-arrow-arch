/**
 * The orchestrator: state manager + loop manager, running in the background.
 * Each tick it folds the log into state, asks decide() what should happen, and
 * carries that out; every few seconds it rebuilds the ledger from what really
 * runs and reaps what's stale. It never plans and never writes product code.
 */
import { decide, type Action } from "./decide";
import { onboardingGate, planGate } from "./gate";
import * as git from "./git";
import { DEFAULTS, effectiveSettings, HOUSE_RULES } from "./house-rules";
import { fromRun, job } from "./jobs";
import { refreshLedger } from "./ledger-scan";
import { runPacketStep } from "./packet-steps";
import { run, scrubbedEnv } from "./proc";
import { project } from "./project";
import * as roles from "./roles";
import { append, paths, readEvents } from "./store";
import { subject } from "./types";
import type { GateItem, Plan, ProjectState } from "./types";

const inflight = new Set<string>(); // dispatched this process, job.started may not be on disk yet
export const inflightCount = () => inflight.size;
const lastLedger = new Map<string, number>();
const LEDGER_EVERY_MS = 5000;

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
  if (s.repo && Date.now() - (lastLedger.get(pid) ?? 0) > LEDGER_EVERY_MS && !inflight.has(`ledger:${pid}`)) {
    lastLedger.set(pid, Date.now());
    inflight.add(`ledger:${pid}`);
    refreshLedger(pid, s)
      .catch((e) => append(pid, { type: "note", level: "warn", message: `Ledger refresh failed: ${(e as Error).message}` }))
      .finally(() => inflight.delete(`ledger:${pid}`));
  }
  return started;
}

/**
 * After a crash or restart: a job "running" on disk but not in this process is
 * orphaned. Close it out; the next ledger refresh reaps whatever it left running.
 */
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

async function execute(pid: string, s: ProjectState, a: Action): Promise<void> {
  const P = paths(pid);
  const repo = s.repo?.path ?? P.repo;
  const knowledge = s.knowledge;

  switch (a.kind) {
    case "clone":
      return job(pid, { role: "orchestrator", subject: subject.clone, attempt: a.attempt }, async () => {
        const c = await git.clone(s.repoUrl, P.repo, s.branch);
        append(pid, { type: "repo.cloned", path: P.repo, branch: c.branch, head: c.head });
        return { ok: true };
      });

    case "onboard":
      return job(pid, { role: "onboarder", subject: subject.onboard, attempt: a.attempt }, async (ctx) => {
        const r = await roles.onboarder({
          ...ctx, env: scrubbedEnv(), feedback: a.feedback,
          input: { repoPath: repo, repoUrl: s.repoUrl, rulesText: s.rulesText, houseRules: HOUSE_RULES, houseDefaults: DEFAULTS },
        });
        if (r.result) {
          append(pid, { type: "profile.ready", profile: r.result });
          if (r.result.decisions.length)
            append(pid, { type: "knowledge.recorded", entries: r.result.decisions.map((d) => ({ kind: "decision" as const, text: d.why ? `${d.text} (${d.why})` : d.text, source: d.source || "onboarding" })) });
        }
        return fromRun(r);
      });

    case "open_onboarding_gate":
      append(pid, { type: "gate.opened", gate: onboardingGate(s.profile!, await toolchainItems(s)) });
      return;

    case "pm": {
      const t = s.tasks[a.taskId];
      return job(pid, { role: "pm", subject: subject.pm(a.taskId), attempt: a.attempt }, async (ctx) => {
        const r = await roles.pm({ ...ctx, env: scrubbedEnv(), cwd: repo, feedback: a.feedback, input: { task: t.text, profile: s.profile!, knowledge } });
        if (r.result) append(pid, { type: "spec.ready", taskId: a.taskId, spec: r.result });
        return fromRun(r);
      });
    }

    case "architect": {
      const t = s.tasks[a.taskId];
      const house = effectiveSettings(s.profile!.houseRules, true);
      return job(pid, { role: "architect", subject: subject.architect(a.taskId), attempt: a.attempt }, async (ctx) => {
        const r = await roles.architect({
          ...ctx, env: scrubbedEnv(), cwd: repo, feedback: a.feedback,
          input: { taskId: a.taskId, task: t.text, spec: t.spec!, answers: t.answers ?? {}, profile: s.profile!, house, knowledge },
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
      const house = effectiveSettings(s.profile!.houseRules, true);
      append(pid, { type: "gate.opened", gate: planGate(a.taskId, t.plan!, t.spec!, s.profile!.rules, house) });
      return;
    }

    case "park":
      append(pid, { type: "step.parked", subject: a.subject, reason: a.reason });
      return;

    default:
      return runPacketStep(pid, s, a);
  }
}

/** Does this machine have the runtimes the repo says it needs? Majors only; a mismatch is a note, not a stop. */
async function toolchainItems(s: ProjectState): Promise<GateItem[]> {
  const items: GateItem[] = [];
  for (const rt of s.profile!.toolchain.runtimes) {
    if (!/^[a-z0-9._-]+$/i.test(rt.name)) continue;
    const r = await run(rt.name, ["--version"], { timeoutMs: 10_000 });
    const have = r.code === 0 ? r.out.match(/\d+(\.\d+)*/)?.[0] : undefined;
    const want = rt.version.match(/\d+/)?.[0];
    if (!have) items.push({ level: "warning", title: `${rt.name} is not installed here`, detail: `The repo expects ${rt.name} ${rt.version} (${rt.source || "from the repo"}).`, suggestion: `Install ${rt.name} ${rt.version} before running tasks.` });
    else if (want && have.split(".")[0] !== want) items.push({ level: "warning", title: `${rt.name} version differs`, detail: `The repo expects ${rt.version}; this machine has ${have}.`, suggestion: `Switch to ${rt.name} ${rt.version} if installs or builds fail.` });
  }
  return items;
}

/** Checks a model can get wrong but code can prove: unique ids, real deps, no cycles. */
export function planProblem(plan: Plan): string | undefined {
  const ids = plan.packets.map((p) => p.id);
  const dup = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dup) return `Packet id ${dup} is used twice.`;
  for (const p of plan.packets) {
    if (!/^[A-Za-z0-9-]+$/.test(p.id) || p.id.includes("--")) return `Packet id "${p.id}" may only use letters, digits and single dashes.`;
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
