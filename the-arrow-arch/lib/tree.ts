/**
 * The task tree's rows, read off the task's timeline: which runs, checks, re-aims
 * and decisions belong to the project manager, the architect, each packet, and
 * the acceptance check. Pure — the tree component only draws what this returns.
 */
import type { Failure, JobView, Packet, ProjectState, TaskStep, TaskView } from "@/engine/types";

export type Row =
  | { kind: "run"; job: JobView } //                        an agent run: open it for its prompt and steps
  | { kind: "prepare"; job: JobView } //                    Arrow made the packet's copy
  | { kind: "check"; ok: boolean; report: string[]; failure?: Failure; at: string } // Arrow re-ran the proof
  | { kind: "reaim"; job?: JobView; note: string; before: Packet; after: Packet; moved: string[] }
  | { kind: "merged"; head: string }
  | { kind: "accepted"; ok: boolean; report: string[]; failures: string[] }
  | { kind: "added"; packets: string[]; reason: string; by: string; job?: JobView }
  | { kind: "gate"; gateId: string; decision: string; note?: string; plan?: string }
  | { kind: "parked"; reason: string; current: boolean } // current: still waiting on you, not history
  | { kind: "retried" };

const kindOf = (sub: string) => sub.split(":").at(-1)!;

/** A packet's rows, in order. A verify run and its verdict are one row; so are a re-aim run and what it changed. */
export function packetRows(s: ProjectState, t: TaskView, id: string): Row[] {
  const steps = t.timeline.filter((x) => x.packetId === id);
  const rows: Row[] = [];
  for (let i = 0; i < steps.length; i++) {
    const st = steps[i];
    if (st.kind === "job") {
      const job = s.jobs[st.jobId];
      if (!job) continue;
      const k = kindOf(job.subject);
      if (k === "work") rows.push({ kind: "run", job });
      else if (k === "prepare") rows.push({ kind: "prepare", job });
      else if (k === "repair") {
        const re = steps.slice(i + 1).find((x) => x.kind === "reaimed");
        if (!re) rows.push({ kind: "run", job }); // still re-aiming, or it failed
      }
      // verify and merge runs are shown by their verdicts
      continue;
    }
    if (st.kind === "verified" || st.kind === "failed")
      rows.push({ kind: "check", ok: st.kind === "verified", report: st.kind === "verified" ? st.report : (st.failure.report ?? []), failure: st.kind === "failed" ? st.failure : undefined, at: st.at });
    else if (st.kind === "reaimed") {
      const job = [...steps.slice(0, i)].reverse().find((x): x is Extract<TaskStep, { kind: "job" }> => x.kind === "job" && kindOf(s.jobs[x.jobId]?.subject ?? "") === "repair");
      const nextAim = steps.slice(i + 1).find((x) => x.kind === "reaimed");
      const moved = steps.slice(i + 1, i + 2).flatMap((x) => (x.kind === "added" ? x.packets : []));
      rows.push({ kind: "reaim", job: job ? s.jobs[job.jobId] : undefined, note: st.note, before: st.before, after: nextAim?.kind === "reaimed" ? nextAim.before : t.packets[id].packet, moved });
    } else if (st.kind === "merged") rows.push({ kind: "merged", head: st.head });
    else if (st.kind === "parked") rows.push({ kind: "parked", reason: st.reason, current: s.parked[st.subject]?.at === st.at });
    else if (st.kind === "retried") rows.push({ kind: "retried" });
  }
  return rows;
}

/** The task's own rows for one part of the tree: the project manager, the architect, or the acceptance check. */
export function taskRows(s: ProjectState, t: TaskView, part: "pm" | "architect" | "accept"): Row[] {
  const subjects = { pm: ["pm"], architect: ["architect"], accept: ["accept", "complete"] }[part];
  const mine = (sub: string) => subjects.includes(kindOf(sub)) && sub.split(":").length === 2;
  const rows: Row[] = [];
  for (const st of t.timeline) {
    if (st.packetId) continue;
    if (st.kind === "job") {
      const job = s.jobs[st.jobId];
      if (job && mine(job.subject) && kindOf(job.subject) !== "accept") rows.push({ kind: "run", job });
    } else if ((st.kind === "accepted" || st.kind === "unaccepted") && part === "accept")
      rows.push({ kind: "accepted", ok: st.kind === "accepted", report: st.report, failures: st.kind === "unaccepted" ? st.failures : [] });
    else if (st.kind === "added" && st.by === "completion" && part === "accept") rows.push({ kind: "added", packets: st.packets, reason: st.reason, by: st.by });
    else if (st.kind === "gate" && st.gateId.startsWith("plan-") && part === "architect") rows.push({ kind: "gate", gateId: st.gateId, decision: st.decision, note: st.note, plan: st.plan });
    else if ((st.kind === "parked" || st.kind === "retried") && mine(st.subject))
      rows.push(st.kind === "parked" ? { kind: "parked", reason: st.reason, current: s.parked[st.subject]?.at === st.at } : { kind: "retried" });
  }
  return rows;
}

/**
 * Packets by phase. The first plan is phase 1; each phase the architect plans after
 * a checkpoint starts the next; a re-aim or completion packet joins the phase it
 * was added in. Each phase ends at its checkpoint, if one was opened.
 */
export function phasesOf(s: ProjectState, t: TaskView) {
  const phaseOf = new Map<string, number>();
  const planners = new Map<number, JobView>();
  let cur = 1;
  for (const st of t.timeline) {
    if (st.kind === "job" && kindOf(s.jobs[st.jobId]?.subject ?? "") === "phase") planners.set(cur + 1, s.jobs[st.jobId]);
    if (st.kind !== "added") continue;
    if (st.by === "phase") cur++;
    for (const id of st.packets) phaseOf.set(id, cur);
  }
  const count = Math.max(1, ...t.order.map((id) => phaseOf.get(id) ?? 1));
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    packets: t.order.filter((id) => (phaseOf.get(id) ?? 1) === i + 1),
    planner: planners.get(i + 1), // the architect run that planned it (phases after the first)
    checkpoint: s.gates[`phase-${t.taskId}-${i + 1}`],
  }));
}

/**
 * What the check against the spec actually proved: how many of its checks Arrow
 * ran, how many passed, and how many only a person can judge. "Passed" with
 * nothing run is not a pass — the UI says what was checked, never just "passed".
 */
export function acceptanceCounts(report: string[]) {
  const mine = report.filter((l) => !l.includes("(install)"));
  const ran = mine.filter((l) => l.startsWith("PASS") || l.startsWith("FAIL")).length;
  return { ran, passed: mine.filter((l) => l.startsWith("PASS")).length, forYou: mine.filter((l) => l.startsWith("YOU")).length };
}

/** Packets that wait for this one, and whether this one still waits for its own deps. */
export function depsOf(t: TaskView, id: string) {
  const p = t.packets[id];
  return {
    waitingFor: p.packet.deps.filter((d) => t.packets[d]?.status !== "merged"),
    unblocks: t.order.filter((o) => t.packets[o].packet.deps.includes(id)),
  };
}
