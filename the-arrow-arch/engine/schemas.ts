/**
 * The shapes every agent hands back, as zod schemas. The TypeScript types are
 * derived from these, so what the orchestrator validates and what the code
 * compiles against can never drift apart.
 */
import { z } from "zod";
import { HouseOutcome } from "./house-rules";

const str = z.string().trim().min(1);
const list = <T extends z.ZodTypeAny>(t: T) => z.array(t).default([]);

export const Recommendation = z.object({
  decision: z.enum(["continue", "stop"]),
  reason: str,
  suggestions: list(z.string()),
});

export const Rule = z.object({
  id: str,
  text: str,
  source: z.string().default("company rules"),
  // an unknown category is filed as "other" rather than failing the whole onboarding run
  category: z.enum(["structure", "naming", "code", "testing", "security", "process", "other"]).catch("other").default("other"),
  criticality: z.enum(["critical", "normal"]),
  // globs a change may never touch while this rule stands, e.g. "db/migrations/**"
  protectedPaths: list(z.string()),
});

export const RuleFinding = z.object({
  ruleId: str,
  status: z.enum(["ok", "violated", "conflict", "unclear"]),
  evidence: z.string().default(""),
  suggestion: z.string().default(""),
});

export const Profile = z.object({
  summary: str,
  stack: list(z.string()),
  commands: z
    .object({
      setup: z.string().optional(),
      build: z.string().optional(),
      test: z.string().optional(),
      typecheck: z.string().optional(),
      lint: z.string().optional(),
    })
    .default({}),
  structure: list(z.object({ path: str, purpose: str })),
  rules: list(Rule),
  findings: list(RuleFinding),
  // how Arrow itself is tuned for this repo: test command, parallelism, branch naming...
  adaptations: list(z.object({ setting: str, value: z.string().default(""), why: z.string().default("") })),
  // what a fresh worktree needs, and which versions code must be written against
  toolchain: z
    .object({
      packageManager: z.string().optional(),
      lockfile: z.string().optional(),
      runtimes: list(z.object({ name: str, version: str, source: z.string().default("") })),
    })
    .default({ runtimes: [] }),
  dependencies: list(z.object({ name: str, version: str })),
  envVars: list(z.object({ name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), source: z.string().default("") })), // names only, never values
  decisions: list(z.object({ text: str, why: z.string().default(""), source: z.string().default("") })), // e.g. imported ADRs
  houseRules: list(HouseOutcome),
  recommendation: Recommendation,
});

export const Question = z.object({
  id: str,
  question: str, // plain words + one real example; a non-engineer must be able to answer
  options: list(z.string()),
});

export const Spec = z.object({
  title: str,
  intent: str,
  methodology: z.object({
    mode: z.enum(["one_shot", "phased", "iterative"]),
    why: str,
  }),
  acceptance: z
    .array(z.object({ id: str, statement: str, check: str }))
    .min(1, "a spec needs at least one acceptance check"),
  outOfScope: list(z.string()),
  risk: z.enum(["low", "medium", "high"]),
  questions: list(Question),
  rulesTouched: list(z.string()),
});

export const Packet = z.object({
  id: str,
  module: z.string().default("M1"),
  title: str,
  objective: str,
  context: z.string().default(""),
  files: z.array(str).min(1, "a packet must list the files it may change"),
  deps: list(z.string()),
  verification: z.array(str).min(1, "a packet must list commands that prove it"),
  regression: list(z.string()),
  risk: z.enum(["low", "medium", "high"]).default("low"),
  // "refactor": behaviour-preserving, so its checks may already pass before the change
  kind: z.enum(["change", "refactor"]).catch("change").default("change"),
  newDependencies: list(z.string()), // libraries this packet adds — shown at the plan check
  env: list(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/)), // variables the worker needs, by name
});

export const Plan = z.object({
  summary: str,
  modules: list(z.object({ id: str, title: str, context: z.string().default("") })),
  packets: z.array(Packet).min(1, "a plan needs at least one packet"),
  // how the plan leans on each rule; `conflict` only when the plan would bend or break it
  rulesImpact: list(z.object({ ruleId: str, impact: str, conflict: z.boolean().catch(false).default(false) })),
  advice: Recommendation,
  // phased / iterative: what the later phases will do, in order; a person signs off before each is planned
  nextPhases: list(z.string()),
});

/** A re-aimed packet, plus whatever was taken out of it — work is moved, never dropped. */
export const RepairResult = z.object({ packet: Packet, followUps: list(Packet) });

/** The architect's completion pass: packets that close the gap between the finished task and its spec. */
export const Completion = z.object({ packets: z.array(Packet).min(1, "add at least one packet that closes the gap"), note: z.string().default("") });

/**
 * The project manager's review of the finished task — the last step before it
 * lands, and what the person reads first: what was built, how to open it, each
 * "done means" judged with evidence, and what is left for a person's eyes.
 */
export const FinalReport = z.object({
  summary: str,
  view: z
    .object({
      how: z.enum(["page", "server", "none"]).catch("none"), // page: opens from its files; server: needs its own server
      entry: z.string().default(""), //                        the file (page) or URL path (server) to open
      command: z.string().default(""), //                      server: how to start it
    })
    .default({ how: "none", entry: "", command: "" }),
  criteria: list(z.object({ id: str, verdict: z.enum(["met", "not_met", "unsure"]).catch("unsure"), evidence: z.string().default("") })),
  forYou: list(z.string()), // what only a person can judge, and how to look
  notes: list(z.string()), //  shortcuts, gaps, anything the person should know before merging
});

export const WorkerReport = z.object({
  status: z.enum(["implemented", "blocked"]),
  summary: z.string().default(""),
  blockedReason: z.string().optional(),
  // blocked on something only a person can give (a key, access, a decision) — the packet waits for them
  needsYou: z.string().default(""),
  newFacts: list(z.string()),
});

export type Recommendation = z.infer<typeof Recommendation>;
export type Rule = z.infer<typeof Rule>;
export type RuleFinding = z.infer<typeof RuleFinding>;
export type Profile = z.infer<typeof Profile>;
export type Question = z.infer<typeof Question>;
export type Spec = z.infer<typeof Spec>;
export type Packet = z.infer<typeof Packet>;
export type Plan = z.infer<typeof Plan>;
export type WorkerReport = z.infer<typeof WorkerReport>;
export type RepairResult = z.infer<typeof RepairResult>;
export type Completion = z.infer<typeof Completion>;
export type FinalReport = z.infer<typeof FinalReport>;
