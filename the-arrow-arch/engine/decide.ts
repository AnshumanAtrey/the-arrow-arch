/**
 * The loop manager. Pure: state + clock in, next actions out. File overlap,
 * dependencies and budgets are computed here in code — no model ever decides
 * "these two look independent, run both".
 */
import { BUDGETS, LIMITS } from "./config";
import { overlaps } from "./glob";
import { effectiveSettings, type HouseSettings } from "./house-rules";
import { runningJobs } from "./project";
import { phaseGateId, subject } from "./types";
import type { Failure, JobView, PacketView, ProjectState, TaskView } from "./types";

export type Action =
  | { kind: "clone"; attempt: number }
  | { kind: "onboard"; attempt: number; feedback?: string; human?: string }
  | { kind: "open_onboarding_gate" }
  | { kind: "pm"; taskId: string; attempt: number; feedback?: string }
  | { kind: "architect"; taskId: string; attempt: number; feedback?: string; human?: string }
  | { kind: "open_plan_gate"; taskId: string }
  | { kind: "prepare"; taskId: string; packetId: string }
  | { kind: "work"; taskId: string; packetId: string; attempt: number; previous?: Failure; resume?: string }
  | { kind: "verify"; taskId: string; packetId: string }
  | { kind: "merge"; taskId: string; packetId: string }
  | { kind: "repair"; taskId: string; packetId: string; attempt: number }
  | { kind: "accept"; taskId: string }
  | { kind: "complete"; taskId: string; attempt: number; feedback?: string; gaps: string[] }
  | { kind: "report"; taskId: string; attempt: number; feedback?: string }
  | { kind: "open_phase_gate"; taskId: string }
  | { kind: "phase"; taskId: string; attempt: number; feedback?: string; human?: string }
  | { kind: "land"; taskId: string }
  | { kind: "park"; subject: string; reason: string };

type Step = { go: true; attempt: number; feedback?: string; resume?: string } | { go: false; park?: string };

/**
 * One policy for every step, driven only by WHY the last run failed.
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
    case "environment":
      return { go: false, park: f.message }; // a missing key or broken install: a person, never a blind retry
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
    agentStep(subject.onboard, (st) => ({ kind: "onboard", attempt: st.attempt, feedback: st.feedback, human: s.humanNotes[subject.onboard] }));
    return out;
  }
  if (!s.onboardingGateId) return [{ kind: "open_onboarding_gate" }];
  if (s.stage !== "ready") return out; // waiting on the human at the onboarding check

  // ---- tasks
  const house = effectiveSettings(s.profile.houseRules, true);
  const running = runningJobs(s);
  const slotsUsed = running.filter((j) => j.role === "worker" || j.subject.endsWith(":prepare")).length;
  const slots = { free: LIMITS.parallelWorkers - slotsUsed };

  for (const tid of s.taskOrder) {
    const t = s.tasks[tid];
    switch (t.stage) {
      case "pm":
        agentStep(subject.pm(tid), (st) => ({ kind: "pm", taskId: tid, attempt: st.attempt, feedback: st.feedback }));
        break;
      case "architect":
        agentStep(subject.architect(tid), (st) => ({ kind: "architect", taskId: tid, attempt: st.attempt, feedback: st.feedback, human: s.humanNotes[subject.architect(tid)] }));
        break;
      case "plan_gate":
        if (!t.planGateId) out.push({ kind: "open_plan_gate", taskId: tid });
        break;
      case "building":
        if (!s.frozen) build(s, t, now, house, slots, out); // a freeze stops new work; nothing lands
        break;
    }
  }
  return out;
}

const BUSY = ["preparing", "prepared", "working", "verifying", "merging"];

/** One task's packets: land, merge one at a time, verify, retry / re-aim / park, prepare, start work. */
function build(s: ProjectState, t: TaskView, now: number, house: HouseSettings, slots: { free: number }, out: Action[]) {
  const tid = t.taskId;
  const pks = t.order.map((id) => t.packets[id]);
  if (pks.length && pks.every((p) => p.status === "merged")) {
    // every packet is proven; now the whole: the spec's own checks, then land
    if (runningJobs(s).some((j) => j.subject.startsWith(`${tid}:`))) return; // the last merge is still cleaning up
    finish(s, t, now, house, out);
    return;
  }

  // merge queue: strictly one at a time per task branch, in plan order
  if (!pks.some((p) => p.status === "merging")) {
    const next = pks.find((p) => p.status === "verified" && !s.parked[subject.merge(tid, p.packet.id)]);
    if (next) {
      const st = stepPolicy(s.runs[subject.merge(tid, next.packet.id)] ?? [], now);
      if (st.go) out.push({ kind: "merge", taskId: tid, packetId: next.packet.id });
      else if (st.park) out.push({ kind: "park", subject: subject.merge(tid, next.packet.id), reason: st.park });
    }
  }

  // which packet holds which files right now; a packet never clashes with itself
  const claims = new Map(pks.filter((p) => BUSY.includes(p.status)).map((p) => [p.packet.id, p.packet.files]));
  const takeSlot = (p: PacketView) => {
    const others = [...claims].filter(([id]) => id !== p.packet.id).flatMap(([, files]) => files);
    if (slots.free <= 0 || clash(p, others)) return false;
    claims.set(p.packet.id, p.packet.files);
    slots.free--;
    return true;
  };
  const startWork = (p: PacketView, attempt: number, extra: Partial<Extract<Action, { kind: "work" }>> = {}) =>
    out.push({ kind: "work", taskId: tid, packetId: p.packet.id, attempt, ...extra });

  for (const p of pks) {
    const pid = p.packet.id;
    const work = subject.work(tid, pid);
    if (s.parked[work] || s.parked[subject.prepare(tid, pid)]) continue;

    if (p.status === "built") {
      const st = stepPolicy((s.runs[subject.verify(tid, pid)] ?? []).filter((j) => Date.parse(j.startedAt) >= lastEnd(s, work)), now);
      if (st.go) out.push({ kind: "verify", taskId: tid, packetId: pid });
      else if (st.park) out.push({ kind: "park", subject: work, reason: `Checking this packet kept crashing: ${st.park}` });
      continue;
    }
    if (p.status === "prepared") {
      if (takeSlot(p)) startWork(p, p.attempts + 1, { previous: p.lastFailure });
      continue;
    }
    if (p.status === "waiting") {
      const depsMerged = p.packet.deps.every((d) => t.packets[d]?.status === "merged");
      const st = stepPolicy(s.runs[subject.prepare(tid, pid)] ?? [], now);
      if (!depsMerged) continue;
      if (st.go && takeSlot(p)) out.push({ kind: "prepare", taskId: tid, packetId: pid });
      else if (!st.go && st.park) out.push({ kind: "park", subject: subject.prepare(tid, pid), reason: st.park });
      continue;
    }
    if (p.status !== "failed") continue;

    const f = p.lastFailure!;
    if (f.class === "protected" || f.class === "environment") {
      // critical rule touched, or the machine is broken: a person, never a blind retry
      out.push({ kind: "park", subject: work, reason: f.message });
      continue;
    }
    const repairSub = subject.repair(tid, pid);
    if ((s.runs[repairSub] ?? []).some((j) => !j.finishedAt)) continue;
    const reAim = () => {
      if (p.repairs >= house.loops.repairs) {
        out.push({ kind: "park", subject: work, reason: `Still failing after a retry and a re-plan. ${f.message}`.trim() });
        return;
      }
      const st = stepPolicy(s.runs[repairSub] ?? [], now);
      if (st.go) out.push({ kind: "repair", taskId: tid, packetId: pid, attempt: st.attempt });
      else if (st.park) out.push({ kind: "park", subject: work, reason: `The architect could not re-aim it: ${st.park}` });
    };

    if (f.class === "verification") {
      // the shot missed: one more worker run with the report, then the aim is fixed
      if (p.attempts <= house.loops.codeRetries) {
        if (takeSlot(p)) startWork(p, p.attempts + 1, { previous: f, resume: s.sessions[work] });
      } else reAim();
    } else if (f.class === "scope" || f.class === "merge" || f.class === "bad_check") {
      reAim(); // the aim was wrong — a retry of the same packet can't fix it
    } else {
      // provider / timeout / internal / bad_output on the worker run itself
      const st = stepPolicy(s.runs[work] ?? [], now);
      if (st.go) {
        if (takeSlot(p)) startWork(p, st.attempt, { resume: st.resume });
      } else if (st.park) out.push({ kind: "park", subject: work, reason: st.park });
    }
  }
}

/**
 * All packets merged. A phased task stops at a checkpoint: a person looks at what
 * landed before the architect plans the next phase. After the last phase: accept,
 * fill the gap once if the spec isn't met, then land — or hand it to a person.
 */
function finish(s: ProjectState, t: TaskView, now: number, house: HouseSettings, out: Action[]) {
  const tid = t.taskId;
  if (t.plan?.nextPhases.length) {
    const g = s.gates[phaseGateId(t)];
    if (!g) out.push({ kind: "open_phase_gate", taskId: tid });
    if (g?.decision !== "approve" || s.parked[subject.phase(tid)]) return; // waiting on you
    const st = stepPolicy(s.runs[subject.phase(tid)] ?? [], now);
    if (st.go) out.push({ kind: "phase", taskId: tid, attempt: st.attempt, feedback: st.feedback, human: s.humanNotes[subject.phase(tid)] });
    else if (st.park) out.push({ kind: "park", subject: subject.phase(tid), reason: `The architect couldn't plan the next phase: ${st.park}` });
    return;
  }
  const accept = subject.accept(tid);
  if (s.parked[accept]) return;
  if (!t.acceptance) {
    const st = stepPolicy(s.runs[accept] ?? [], now);
    if (st.go) out.push({ kind: "accept", taskId: tid });
    else if (st.park) out.push({ kind: "park", subject: accept, reason: st.park });
    return;
  }
  // what is still missing, and whose step waits for a person if the architect can't close it
  let gaps = t.acceptance.failures;
  let owner = accept;
  let why = "Every packet landed, but the finished task still doesn't meet the spec";
  if (t.acceptance.ok) {
    // every command passed; the project manager now reviews the whole against the spec, then it lands
    const report = subject.report(tid);
    if (s.parked[report]) return;
    if (!t.report) {
      const st = stepPolicy(s.runs[report] ?? [], now);
      if (st.go) out.push({ kind: "report", taskId: tid, attempt: st.attempt, feedback: st.feedback });
      else if (st.park) out.push({ kind: "park", subject: report, reason: `The project manager couldn't review the finished task: ${st.park}` });
      return;
    }
    const unmet = t.report.criteria.filter((c) => c.verdict === "not_met");
    if (!unmet.length) {
      out.push({ kind: "land", taskId: tid });
      return;
    }
    gaps = unmet.map((c) => `${c.id} (project manager's review): ${c.evidence}`);
    owner = report;
    why = "Every check passed, but the project manager's review says the spec isn't met";
  }
  const completions = s.runs[subject.complete(tid)] ?? [];
  if (completions.filter((j) => j.ok).length >= house.loops.repairs) {
    out.push({ kind: "park", subject: owner, reason: `${why}: ${gaps.join("; ")}` });
    return;
  }
  const st = stepPolicy(completions, now);
  if (st.go) out.push({ kind: "complete", taskId: tid, attempt: st.attempt, feedback: st.feedback, gaps });
  else if (st.park) out.push({ kind: "park", subject: owner, reason: `The architect couldn't close the gap: ${st.park}` });
}

const clash = (p: PacketView, claimed: string[]) => p.packet.files.some((f) => claimed.some((c) => overlaps(f, c)));

/** Verify runs only count if they started after the latest worker run finished. */
function lastEnd(s: ProjectState, work: string): number {
  const last = (s.runs[work] ?? []).at(-1);
  return last?.finishedAt ? Date.parse(last.finishedAt) : 0;
}
