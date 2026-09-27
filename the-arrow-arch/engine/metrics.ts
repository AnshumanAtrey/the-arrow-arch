/**
 * The numbers that say whether the one-shot bet is paying off — computed from
 * the event log, never from a counter anyone can reset.
 */
import type { JobView, ProjectState } from "./types";

/**
 * What the agents cost. Bob reports a session's running total, so a resumed
 * session's later run already includes the earlier ones: each Bob session counts
 * once, at its largest total. Other engines report what each run cost.
 */
export function spend(jobs: JobView[]): { usd: number; bobcoins: number } {
  const sessions = new Map<string, number>();
  let usd = 0;
  let bobcoins = 0;
  for (const j of jobs) {
    if (j.costUnit === "usd") usd += j.cost ?? 0;
    else if (j.costUnit === "bobcoins" && j.sessionId) sessions.set(j.sessionId, Math.max(sessions.get(j.sessionId) ?? 0, j.cost ?? 0));
    else if (j.costUnit === "bobcoins") bobcoins += j.cost ?? 0;
  }
  for (const c of sessions.values()) bobcoins += c;
  return { usd: round(usd), bobcoins: round(bobcoins) };
}

export type Metrics = {
  packets: number;
  merged: number;
  firstPass: number; //      merged on the first real worker run, no repair
  workerRuns: number;
  repairs: number;
  providerFailures: number; // outages — reported, never blamed on the code
  parked: number;
  agentMinutes: number;
  tokens: number; //          everything the agents reported, input + output
  cost: { usd: number; bobcoins: number };
};

export function metrics(s: ProjectState): Metrics {
  const jobs = Object.values(s.jobs);
  const agentJobs = jobs.filter((j) => j.role !== "orchestrator");
  const packets = Object.values(s.tasks).flatMap((t) => Object.values(t.packets));
  const workerRunsFor = (sub: string) => jobs.filter((j) => j.subject === sub && j.role === "worker" && j.failure?.class !== "provider");

  let firstPass = 0;
  for (const t of Object.values(s.tasks))
    for (const p of Object.values(t.packets))
      if (p.status === "merged" && p.repairs === 0 && workerRunsFor(`${t.taskId}:${p.packet.id}:work`).length === 1) firstPass++;

  const finished = agentJobs.filter((j) => j.finishedAt);
  return {
    packets: packets.length,
    merged: packets.filter((p) => p.status === "merged").length,
    firstPass,
    workerRuns: jobs.filter((j) => j.role === "worker").length,
    repairs: packets.reduce((n, p) => n + p.repairs, 0),
    providerFailures: jobs.filter((j) => j.failure?.class === "provider").length,
    parked: Object.keys(s.parked).length,
    agentMinutes: Math.round(finished.reduce((n, j) => n + (j.durationMs ?? 0), 0) / 6000) / 10,
    tokens: finished.reduce((n, j) => n + (j.tokens?.total ?? 0), 0),
    cost: spend(finished),
  };
}

const round = (n: number) => Math.round(n * 100) / 100;

export type TaskNumbers = { wallMs: number; waitingOnYouMs: number; agentMs: number; tokens: number; cost: { usd: number; bobcoins: number }; caught: Record<string, number>; done: boolean };

/**
 * One task, end to end — what you compare against a plain agent run: how long it
 * took, how much of that was waiting on you, tokens and cost, and what the rules caught.
 */
export function taskNumbers(s: ProjectState, taskId: string, events: { type: string; at: string; [k: string]: unknown }[], now: number): TaskNumbers {
  const t = s.tasks[taskId];
  const start = Date.parse(t.submittedAt);
  const end = t.landed ? Date.parse(events.find((e) => e.type === "task.landed" && e.taskId === taskId)?.at ?? "") : now;
  let waiting = 0;
  const at = (type: string, pred: (e: Record<string, unknown>) => boolean) => events.find((e) => e.type === type && pred(e))?.at;
  const specAt = at("spec.ready", (e) => e.taskId === taskId);
  const answeredAt = at("questions.answered", (e) => e.taskId === taskId);
  if (specAt && t.spec?.questions.length) waiting += (answeredAt ? Date.parse(answeredAt) : now) - Date.parse(specAt);
  const gateId = t.planGateId;
  const openedAt = gateId ? at("gate.opened", (e) => (e.gate as { id?: string })?.id === gateId) : undefined;
  const decidedAt = gateId ? at("gate.decided", (e) => e.gateId === gateId) : undefined;
  if (openedAt) waiting += (decidedAt ? Date.parse(decidedAt) : now) - Date.parse(openedAt);
  const jobs = Object.values(s.jobs).filter((j) => j.subject.startsWith(`${taskId}:`) && j.finishedAt);
  const caught: Record<string, number> = {};
  for (const e of events)
    if (e.type === "packet.failed" && e.taskId === taskId) {
      const c = (e.failure as { class: string }).class;
      caught[c] = (caught[c] ?? 0) + 1;
    }
  for (const j of jobs) if (j.failure) caught[j.failure.class] = (caught[j.failure.class] ?? 0) + 1;
  return {
    wallMs: Math.max(0, (Number.isFinite(end) ? end : now) - start),
    waitingOnYouMs: Math.max(0, waiting),
    agentMs: jobs.filter((j) => j.role !== "orchestrator").reduce((n, j) => n + (j.durationMs ?? 0), 0),
    tokens: jobs.reduce((n, j) => n + (j.tokens?.total ?? 0), 0),
    cost: spend(jobs),
    caught,
    done: Boolean(t.landed),
  };
}
