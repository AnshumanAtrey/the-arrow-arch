/**
 * The event log is the only source of truth. Everything the UI shows and every
 * decision the orchestrator makes is derived from these events — nothing is
 * edited in place, so the history (attempts, repairs, cost) can't be rewritten.
 */
import type { Packet, Plan, Profile, Recommendation, Spec } from "./schemas";

export * from "./schemas";

export type Role = "onboarder" | "pm" | "architect" | "worker" | "orchestrator" | "human";

/**
 * Why something failed decides what happens next. Only a code failure earns a
 * retry; a provider outage never burns an attempt or a re-plan.
 */
export type FailureClass =
  | "provider" //     the model/API/network failed — wait and run again, same attempt
  | "timeout" //      out of time — work is kept, the step is paused for a look
  | "bad_output" //   the agent finished but its result file was missing or malformed
  | "verification" // the orchestrator's own re-run of the checks failed
  | "scope" //        changed files outside what the packet allows
  | "protected" //    touched a path a critical company rule protects
  | "merge" //        passed alone, broke (or conflicted) when combined
  | "internal"; //    Arrow itself or the agent process crashed / was orphaned

export type Failure = { class: FailureClass; message: string; report?: string[] };

export type GateKind = "onboarding" | "plan";
export type GateItem = {
  level: "critical" | "warning" | "ok";
  title: string;
  detail: string;
  ruleId?: string;
  suggestion?: string;
};
export type Gate = {
  id: string;
  kind: GateKind;
  subject: string; // "project" or a task id
  verdict: "green" | "red";
  items: GateItem[];
  recommendation: Recommendation;
};
export type GateDecision = "approve" | "stop";

type E<T extends string, P> = { type: T; at: string } & P;

export type ArrowEvent =
  | E<"project.created", { name: string; repoUrl: string; branch?: string; rulesText: string }>
  | E<"repo.cloned", { path: string; branch: string; head: string }>
  | E<"job.started", { jobId: string; role: Role; subject: string; attempt: number; driver: string }>
  | E<"job.finished", {
      jobId: string;
      ok: boolean;
      failure?: Failure;
      durationMs: number;
      costUsd?: number;
      sessionId?: string;
    }>
  | E<"profile.ready", { profile: Profile }>
  | E<"gate.opened", { gate: Gate }>
  | E<"gate.decided", { gateId: string; decision: GateDecision; note?: string }>
  | E<"task.submitted", { taskId: string; text: string }>
  | E<"spec.ready", { taskId: string; spec: Spec }>
  | E<"questions.answered", { taskId: string; answers: Record<string, string> }>
  | E<"plan.ready", { taskId: string; plan: Plan; branch: string; base: string }>
  | E<"packet.verified", { taskId: string; packetId: string; report: string[]; changedFiles: string[] }>
  | E<"packet.failed", { taskId: string; packetId: string; failure: Failure }>
  | E<"packet.repaired", { taskId: string; packetId: string; packet: Packet; note: string }>
  | E<"packet.merged", { taskId: string; packetId: string; head: string }>
  // the loop manager gave up on a step (onboard, pm, a packet...) — a human looks
  | E<"step.parked", { subject: string; reason: string }>
  | E<"step.retried", { subject: string; note?: string }>
  | E<"task.landed", { taskId: string; branch: string; head: string }>
  | E<"task.halted", { taskId: string; reason: string }>
  | E<"note", { level: "info" | "warn"; message: string; subject?: string }>;

export type EventOf<T extends ArrowEvent["type"]> = Extract<ArrowEvent, { type: T }>;
type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** What callers pass to append(); the store stamps `at`. */
export type NewEvent = DistOmit<ArrowEvent, "at">;

/** Job subjects — one naming scheme so "is something already running for X" is a lookup. */
export const subject = {
  clone: "clone",
  onboard: "onboard",
  pm: (t: string) => `${t}:pm`,
  architect: (t: string) => `${t}:architect`,
  work: (t: string, p: string) => `${t}:${p}:work`,
  verify: (t: string, p: string) => `${t}:${p}:verify`,
  merge: (t: string, p: string) => `${t}:${p}:merge`,
  repair: (t: string, p: string) => `${t}:${p}:repair`,
};

// ---------------------------------------------------------------- derived state

export type JobView = {
  jobId: string;
  role: Role;
  subject: string;
  attempt: number;
  driver: string;
  startedAt: string;
  finishedAt?: string;
  ok?: boolean;
  failure?: Failure;
  durationMs?: number;
  costUsd?: number;
  sessionId?: string;
};

export type PacketStatus =
  | "waiting" //   deps not merged yet, or not its turn
  | "working" //   a worker is on it
  | "built" //     worker finished; orchestrator hasn't checked it yet
  | "verifying"
  | "verified" //  proven on its own; queued to merge
  | "merging"
  | "merged"
  | "failed" //    last check failed; the loop manager decides retry / repair / park
  | "parked"; //   needs a human

export type PacketView = {
  packet: Packet;
  status: PacketStatus;
  attempts: number; // worker runs that reached verification (provider outages don't count)
  repairs: number;
  lastFailure?: Failure;
  report?: string[];
  changedFiles?: string[];
  parkedReason?: string;
};

export type TaskStage = "pm" | "questions" | "architect" | "plan_gate" | "building" | "landed" | "halted";

export type TaskView = {
  taskId: string;
  text: string;
  submittedAt: string;
  stage: TaskStage;
  spec?: Spec;
  answers?: Record<string, string>;
  plan?: Plan;
  branch?: string;
  base?: string;
  planGateId?: string;
  packets: Record<string, PacketView>;
  order: string[];
  landed?: { branch: string; head: string };
  haltedReason?: string;
};

export type ProjectStage = "cloning" | "onboarding" | "onboarding_gate" | "ready" | "stopped";

export type ProjectState = {
  id: string;
  name: string;
  repoUrl: string;
  branch?: string;
  rulesText: string;
  createdAt: string;
  stage: ProjectStage;
  repo?: { path: string; branch: string; head: string };
  profile?: Profile;
  onboardingGateId?: string;
  gates: Record<string, Gate & { decision?: GateDecision; note?: string; decidedAt?: string }>;
  tasks: Record<string, TaskView>;
  taskOrder: string[];
  jobs: Record<string, JobView>;
  /** runs per subject since its last reset (human retry / architect repair) — what budgets count */
  runs: Record<string, JobView[]>;
  /** newest agent session per subject, kept across resets so a paused step can resume */
  sessions: Record<string, string>;
  parked: Record<string, { reason: string; at: string }>;
  notes: { at: string; level: "info" | "warn"; message: string; subject?: string }[];
  events: number;
  updatedAt: string;
};
