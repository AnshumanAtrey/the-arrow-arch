import path from "node:path";

const int = (v: string | undefined, d: number) => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : d;
};

export const ROOT = path.resolve(process.env.ARROW_ROOT ?? process.cwd());
export const DATA_DIR = path.resolve(process.env.ARROW_DATA ?? path.join(ROOT, ".arrow-data"));
export const PROMPTS_DIR = path.join(ROOT, "prompts");

export type DriverName = "mock" | "claude" | "bob";
const DRIVERS: DriverName[] = ["mock", "claude", "bob"];

/** Driver for a role: ARROW_DRIVER_<ROLE> wins over ARROW_DRIVER; default mock. */
export function driverFor(role: string): DriverName {
  const pick = process.env[`ARROW_DRIVER_${role.toUpperCase()}`] ?? process.env.ARROW_DRIVER ?? "mock";
  return (DRIVERS as string[]).includes(pick) ? (pick as DriverName) : "mock";
}

export const LIMITS = {
  parallelWorkers: int(process.env.ARROW_PARALLEL, 3),
  agentTimeoutMs: int(process.env.ARROW_AGENT_TIMEOUT_S, 1800) * 1000,
  commandTimeoutMs: int(process.env.ARROW_COMMAND_TIMEOUT_S, 900) * 1000,
  tickMs: int(process.env.ARROW_TICK_MS, 1500),
  mockDelayMs: int(process.env.ARROW_MOCK_DELAY_MS, 1200),
};

/**
 * The loop manager's budgets, per failure class. Every automatic re-run is
 * bounded here; past a budget the step parks and waits for a human.
 */
export const BUDGETS = {
  providerRetries: 4, //     outages: rerun the same attempt, with backoff
  providerBackoffMs: 30_000,
  badOutputRetries: 1, //    agent wrote no/invalid result file: one more go with the errors
  internalRetries: 1, //     crash/orphan: one clean rerun
  codeRetries: 1, //         failed checks: one more worker run with the failure report
  repairs: 1, //             then the architect re-aims the packet, exactly once
  cloneRetries: 1,
};
