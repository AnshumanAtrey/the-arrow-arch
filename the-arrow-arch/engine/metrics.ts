/**
 * The numbers that say whether the one-shot bet is paying off — computed from
 * the event log, never from a counter anyone can reset.
 */
import type { ProjectState } from "./types";

export type Metrics = {
  packets: number;
  merged: number;
  firstPass: number; //      merged on the first real worker run, no repair
  workerRuns: number;
  repairs: number;
  providerFailures: number; // outages — reported, never blamed on the code
  parked: number;
  agentMinutes: number;
  costUsd: number;
  costKnown: boolean; //     false when some runs could not report cost (mock, killed, bob)
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
    costUsd: Math.round(finished.reduce((n, j) => n + (j.costUsd ?? 0), 0) * 100) / 100,
    costKnown: finished.length > 0 && finished.every((j) => j.costUsd !== undefined),
  };
}
