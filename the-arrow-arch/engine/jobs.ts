/** A job is one step the orchestrator runs: logged when it starts, when it has a process, and when it ends. */
import path from "node:path";
import { harnessFor } from "./settings";
import { append, newJobId, paths } from "./store";
import type { Usage } from "./agents/driver";
import type { Failure, Role } from "./types";

export type JobOutcome = { ok: boolean; failure?: Failure; sessionId?: string; tokens?: Usage; cost?: number; costUnit?: "usd" | "bobcoins" };
export type JobCtx = { jobId: string; logFile: string; onSpawn: (pid: number) => void };

export async function job(pid: string, meta: { role: Role; subject: string; attempt: number; port?: number }, fn: (ctx: JobCtx) => Promise<JobOutcome>) {
  const jobId = newJobId();
  const driver = meta.role === "orchestrator" ? "arrow" : harnessFor(meta.role);
  append(pid, { type: "job.started", jobId, ...meta, driver });
  const t0 = Date.now();
  let r: JobOutcome;
  try {
    r = await fn({
      jobId,
      logFile: path.join(paths(pid).logs, `${jobId}.log`),
      onSpawn: (p) => append(pid, { type: "job.spawned", jobId, pid: p }),
    });
  } catch (e) {
    r = { ok: false, failure: { class: "internal", message: (e as Error).message } };
  }
  append(pid, { type: "job.finished", jobId, ok: r.ok, failure: r.failure, durationMs: Date.now() - t0, sessionId: r.sessionId, tokens: r.tokens, cost: r.cost, costUnit: r.costUnit });
}

export const fromRun = (r: { failure?: Failure; exit: { sessionId?: string; usage?: Usage; cost?: number; costUnit?: "usd" | "bobcoins" } }): JobOutcome => ({
  ok: !r.failure,
  failure: r.failure,
  sessionId: r.exit.sessionId,
  tokens: r.exit.usage,
  cost: r.exit.cost,
  costUnit: r.exit.costUnit,
});
