/**
 * The loop manager. Pure: state + clock in, next actions out. File overlap,
 * dependencies and budgets are computed here in code — no model ever decides
 * "these two look independent, run both".
 */
import { BUDGETS, LIMITS } from "./config";
import { overlaps } from "./glob";
import { runningJobs } from "./project";
import { subject } from "./types";
import type { Failure, JobView, PacketView, ProjectState, TaskView } from "./types";

export type Action =
  | { kind: "clone"; attempt: number }
  | { kind: "onboard"; attempt: number; feedback?: string }
  | { kind: "open_onboarding_gate" }
  | { kind: "pm"; taskId: string; attempt: number; feedback?: string }
  | { kind: "architect"; taskId: string; attempt: number; feedback?: string }
  | { kind: "open_plan_gate"; taskId: string }
  | { kind: "work"; taskId: string; packetId: string; attempt: number; previous?: Failure; resume?: string }
  | { kind: "verify"; taskId: string; packetId: string }
  | { kind: "merge"; taskId: string; packetId: string }
  | { kind: "repair"; taskId: string; packetId: string; attempt: number }
  | { kind: "land"; taskId: string }
  | { kind: "park"; subject: string; reason: string };

type Step = { go: true; attempt: number; feedback?: string; resume?: string } | { go: false; park?: string };

/**
 * One policy for every agent step, driven only by WHY the last run failed.
 * Returns whether to run now, wait, or hand to a human.
 */
export function stepPolicy(runs: JobView[], now: number): Step {
  if (runs.some((r) => !r.finishedAt)) return { go: false };
  const last = runs.at(-1);
  if (!last) return { go: true, attempt: 1 };
  if (last.ok) return { go: false };
  const f = last.failure;
  const tailOf = (c: string) => {
    let n = 0;
    for (let i = runs.length - 1; i >= 0 && runs[i].failure?.class === c; i--) n++;
    return n;
  };
  switch (f?.class) {
    case "provider": {
      const n = tailOf("provider");
      if (n > BUDGETS.providerRetries) return { go: false, park: `The model provider kept failing (${n} times): ${f.message}` };
      const waited = now - Date.parse(last.finishedAt!);
      return waited >= BUDGETS.providerBackoffMs * n ? { go: true, attempt: last.attempt, resume: last.sessionId } : { go: false };
    }
    case "timeout":
      return { go: false, park: "Ran out of time. Its work is kept — continue to pick up where it stopped." };
    case "bad_output":
      return tailOf("bad_output") > BUDGETS.badOutputRetries
        ? { go: false, park: `It kept handing back an unusable result: ${f.message}` }
        : { go: true, attempt: last.attempt + 1, feedback: f.message };
    default:
      return tailOf(f?.class ?? "internal") > BUDGETS.internalRetries
        ? { go: false, park: f?.message ?? "It stopped without saying why." }
        : { go: true, attempt: last.attempt, resume: last.sessionId };
  }
}

export function decide(s: ProjectState, now: number): Action[] {
  const out: Action[] = [];
  if (s.stage === "stopped") return out;
  const runs = (sub: string) => s.runs[sub] ?? [];
  const parked = (sub: string) => Boolean(s.parked[sub]);

  const agentStep = (sub: string, make: (st: Extract<Step, { go: true }>) => Action) => {
    if (parked(sub)) return;
    const st = stepPolicy(runs(sub), now);
    if (st.go) out.push(make(st));
    else if (st.park) out.push({ kind: "park", subject: sub, reason: st.park });
  };

  // ---- onboarding
  if (!s.repo) {
    const r = runs(subject.clone);
    if (!parked(subject.clone) && !r.some((j) => !j.finishedAt)) {
      const fails = r.filter((j) => j.ok === false).length;
      if (fails > BUDGETS.cloneRetries)
        out.push({ kind: "park", subject: subject.clone, reason: r.at(-1)?.failure?.message ?? "Clone failed." });
      else out.push({ kind: "clone", attempt: fails + 1 });
    }
    return out;
  }
  if (!s.profile) {
    agentStep(subject.onboard, (st) => ({ kind: "onboard", attempt: st.attempt, feedback: st.feedback }));
    return out;
  }
  if (!s.onboardingGateId) return [{ kind: "open_onboarding_gate" }];
  if (s.stage !== "ready") return out; // waiting on the human at the onboarding gate

  // ---- tasks
  const running = runningJobs(s);
  let freeWorkers = LIMITS.parallelWorkers - running.filter((j) => j.role === "worker").length;

  for (const tid of s.taskOrder) {
    const t = s.tasks[tid];
    switch (t.stage) {
      case "pm":
        agentStep(subject.pm(tid), (st) => ({ kind: "pm", taskId: tid, attempt: st.attempt, feedback: st.feedback }));
        break;
      case "architect":
        agentStep(subject.architect(tid), (st) => ({ kind: "architect", taskId: tid, attempt: st.attempt, feedback: st.feedback }));
        break;
      case "plan_gate":
        if (!t.planGateId) out.push({ kind: "open_plan_gate", taskId: tid });
        break;
      case "building":
        freeWorkers = build(s, t, now, freeWorkers, out);
        break;
    }
  }
  return out;
}

/** One task's packets: land, merge one at a time, verify, retry/repair/park, start ready work. */
function build(s: ProjectState, t: TaskView, now: number, freeWorkers: number, out: Action[]): number {
  const tid = t.taskId;
  const pks = t.order.map((id) => t.packets[id]);
  if (pks.length && pks.every((p) => p.status === "merged")) {
    out.push({ kind: "land", taskId: tid });
    return freeWorkers;
  }
  const busy = (p: PacketView) => ["working", "verifying", "merging"].includes(p.status);

  // merge queue: strictly one at a time per task branch, in plan order
  if (!pks.some((p) => p.status === "merging")) {
    const next = pks.find((p) => p.status === "verified" && !s.parked[subject.merge(tid, p.packet.id)]);
    if (next) {
      const st = stepPolicy(s.runs[subject.merge(tid, next.packet.id)] ?? [], now);
      if (st.go) out.push({ kind: "merge", taskId: tid, packetId: next.packet.id });
      else if (st.park) out.push({ kind: "park", subject: subject.merge(tid, next.packet.id), reason: st.park });
    }
  }

  const claimed = pks.filter(busy).flatMap((p) => p.packet.files);
  for (const p of pks) {
    const pid = p.packet.id;
    const work = subject.work(tid, pid);
    if (p.status === "built") {
      const st = stepPolicy(s.runs[subject.verify(tid, pid)]?.filter((j) => Date.parse(j.startedAt) >= lastWorkEnd(s, work)) ?? [], now);
      if (st.go) out.push({ kind: "verify", taskId: tid, packetId: pid });
      else if (st.park) out.push({ kind: "park", subject: work, reason: `Checking this packet kept crashing: ${st.park}` });
      continue;
    }
    if (p.status === "failed") {
      const cls = p.lastFailure?.class;
      if (cls === "verification" || cls === "scope" || cls === "merge") {
        const repairSub = subject.repair(tid, pid);
        const repairRunning = (s.runs[repairSub] ?? []).some((j) => !j.finishedAt);
        if (repairRunning) continue;
        if (cls === "verification" && p.attempts <= BUDGETS.codeRetries) {
          if (freeWorkers > 0 && !clash(p, claimed)) {
            out.push({ kind: "work", taskId: tid, packetId: pid, attempt: p.attempts + 1, previous: p.lastFailure, resume: s.sessions[work] });
            claimed.push(...p.packet.files);
            freeWorkers--;
          }
        } else if (p.repairs < BUDGETS.repairs) {
          const st = stepPolicy(s.runs[repairSub] ?? [], now);
          if (st.go) out.push({ kind: "repair", taskId: tid, packetId: pid, attempt: st.attempt });
          else if (st.park) out.push({ kind: "park", subject: work, reason: `The architect could not re-aim it: ${st.park}` });
        } else {
          out.push({ kind: "park", subject: work, reason: `Still failing after a retry and a re-plan. ${p.lastFailure?.message ?? ""}`.trim() });
        }
        continue;
      }
      if (cls === "protected") {
        out.push({ kind: "park", subject: work, reason: p.lastFailure!.message });
        continue;
      }
      // provider / timeout / internal on the worker run itself: the generic policy decides
      const st = stepPolicy(s.runs[work] ?? [], now);
      if (st.go && freeWorkers > 0 && !clash(p, claimed)) {
        out.push({ kind: "work", taskId: tid, packetId: pid, attempt: st.attempt, resume: st.resume });
        claimed.push(...p.packet.files);
        freeWorkers--;
      } else if (!st.go && st.park) out.push({ kind: "park", subject: work, reason: st.park });
      continue;
    }
    if (p.status !== "waiting" || s.parked[work]) continue;
    const depsMerged = p.packet.deps.every((d) => t.packets[d]?.status === "merged");
    if (!depsMerged || freeWorkers <= 0 || clash(p, claimed)) continue;
    out.push({ kind: "work", taskId: tid, packetId: pid, attempt: p.attempts + 1, previous: p.lastFailure });
    claimed.push(...p.packet.files);
    freeWorkers--;
  }
  return freeWorkers;
}

const clash = (p: PacketView, claimed: string[]) => p.packet.files.some((f) => claimed.some((c) => overlaps(f, c)));

/** Verify runs only count if they started after the latest worker run finished. */
function lastWorkEnd(s: ProjectState, work: string): number {
  const last = (s.runs[work] ?? []).at(-1);
  return last?.finishedAt ? Date.parse(last.finishedAt) : 0;
}
