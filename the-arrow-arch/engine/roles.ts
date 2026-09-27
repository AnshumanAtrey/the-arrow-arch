/**
 * The four roles. Each is: a standing prompt (prompts/<role>.md) + the inputs
 * + a result file whose shape is validated. A result that doesn't validate is a
 * `bad_output` failure — never "probably fine".
 */
import fs from "node:fs";
import path from "node:path";
import type { z } from "zod";
import { bob } from "./agents/bob";
import { claude } from "./agents/claude";
import type { AgentExit, Driver } from "./agents/driver";
import { mock } from "./agents/mock";
import { LIMITS, PROMPTS_DIR } from "./config";
import { keysFor, readSettings, type Harness } from "./settings";
import { classifyExit } from "./failures";
import { HOUSE_RULES, type HouseSettings } from "./house-rules";
import * as S from "./schemas";
import { allowedValues } from "./schema-hints";
import type { Failure, Packet, Profile, ProjectState, Role, Rule, Spec } from "./types";

type Knowledge = ProjectState["knowledge"];
export type OnboarderInput = { repoPath: string; repoUrl: string; rulesText: string; houseRules: typeof HOUSE_RULES; houseDefaults: HouseSettings };
export type PmInput = { task: string; profile: Profile; knowledge: Knowledge };
export type ArchitectInput = {
  taskId: string; task: string; spec: Spec; answers: Record<string, string>; profile: Profile; house: HouseSettings; knowledge: Knowledge;
  /** planning a later phase: what already landed, and the phases still ahead (the first is the one to plan) */
  phase?: { number: number; landed: Packet[]; ahead: string[]; note?: string };
};
export type RepairInput = { taskId: string; packet: Packet; failure: Failure; profile: Profile; house: HouseSettings; knowledge: Knowledge; otherPacketIds: string[] };
export type ReportInput = {
  taskId: string; task: string; spec: Spec; answers: Record<string, string>;
  acceptance: string[]; // Arrow's own run of the spec's checks: PASS / FAIL / YOU lines
  packets: { id: string; title: string; objective: string; files: string[]; proof: string[] }[];
  profile: Profile; knowledge: Knowledge;
};
export type CompleteInput = { taskId: string; spec: Spec; failures: string[]; report: string[]; landedPackets: Packet[]; profile: Profile; house: HouseSettings; knowledge: Knowledge };
export type WorkerInput = {
  packet: Packet;
  attempt: number;
  previous?: Failure;
  commands: Profile["commands"];
  versions: Profile["dependencies"]; // code against these installed versions, not memory
  rules: Rule[]; //                     the company's critical rules
  house: HouseSettings; //              what Arrow will check the work against
  beside: { id: string; title: string; files: string[] }[]; // packets of this task that may run at the same time
  decisions: string[];
};

const DRIVERS: Record<Harness, Driver> = { mock, claude, bob };

type Run<T> = { result?: T; failure?: Failure; exit: AgentExit; driver: Harness };

async function runAgent<T>(o: {
  role: Exclude<Role, "orchestrator" | "human">;
  promptFile: string;
  jobId: string;
  cwd: string;
  logFile: string;
  input: unknown;
  schema: z.ZodType<T>;
  example: unknown;
  feedback?: string;
  humanNote?: string; // a person sent the last result back with this
  resume?: string;
  optional?: boolean; // the worker's report is a courtesy; its checks decide
  preface?: string; //  live context written by the orchestrator (the worker's ledger brief)
  env: NodeJS.ProcessEnv;
  onSpawn?: (pid: number) => void;
}): Promise<Run<T>> {
  const settings = readSettings(); // read per run: a change on the Settings page applies to the next step
  const cfg = settings.roles[o.role];
  const driver = cfg.harness;
  // the engine's own key, from Settings (or already in the environment), and nothing else
  const keys = Object.fromEntries(keysFor(cfg).flatMap((k) => (settings.keys[k as keyof typeof settings.keys] ? [[k, settings.keys[k as keyof typeof settings.keys]!]] : [])));
  const outFile = path.join(o.cwd, ".arrow", "out", `${o.jobId}.json`);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.rmSync(outFile, { force: true });
  fs.mkdirSync(path.dirname(o.logFile), { recursive: true });

  const allowed = allowedValues(o.schema);
  const prompt = [
    fs.readFileSync(path.join(PROMPTS_DIR, o.promptFile), "utf8").trim(),
    ...(o.preface ? ["", o.preface] : []),
    "",
    "# Inputs",
    "",
    "```json",
    JSON.stringify(o.input, null, 2),
    "```",
    ...(o.humanNote ? ["", "# A person sent your last result back", "", o.humanNote, "", "Change what they asked for and keep what they didn't mention. Hand back a complete result."] : []),
    ...(o.feedback ? ["", "# Your previous result was rejected", "", o.feedback, "", "Fix exactly that and hand back a complete result."] : []),
    "",
    "# Hand back your result",
    "",
    "Write ONE JSON object — and nothing else — to this file:",
    "",
    `    ${outFile}`,
    "",
    "Its shape, by example:",
    "",
    "```json",
    JSON.stringify(o.example, null, 2),
    "```",
    ...(allowed.length
      ? ["", "# Allowed values", "", "These sets are closed. Use one of these spellings — anything else is rejected, or quietly filed under a fallback, and neither is what you meant:", "", ...allowed.map((l) => `- ${l}`)]
      : []),
    "",
    "Arrow validates that file. Anything you print instead is ignored.",
  ].join("\n");

  const exit = await DRIVERS[driver]({
    role: o.role, jobId: o.jobId, cwd: o.cwd, prompt, outFile, logFile: o.logFile,
    timeoutMs: LIMITS.agentTimeoutMs, resume: o.resume, input: o.input, env: { ...o.env, ...keys }, onSpawn: o.onSpawn,
    cfg, bob: settings.bob,
  });
  const failure = classifyExit(exit);
  if (failure && failure.class !== "internal") return { failure, exit, driver }; // provider / timeout

  if (!fs.existsSync(outFile)) {
    if (o.optional) return { exit, driver };
    return { failure: failure ?? { class: "bad_output", message: `No result file was written to ${outFile}.` }, exit, driver };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(outFile, "utf8"));
  } catch (e) {
    return o.optional ? { exit, driver } : { failure: { class: "bad_output", message: `The result file is not valid JSON: ${(e as Error).message}` }, exit, driver };
  }
  const parsed = o.schema.safeParse(stripNulls(raw));
  if (!parsed.success) {
    if (o.optional) return { exit, driver };
    const why = parsed.error.issues.slice(0, 6).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    return { failure: { class: "bad_output", message: `The result didn't match the required shape — ${why}` }, exit, driver };
  }
  return { result: parsed.data, exit, driver };
}

/** Models often write null for "nothing to say"; treat it as not given, so defaults apply. */
function stripNulls(v: unknown): unknown {
  if (Array.isArray(v)) return v.filter((x) => x !== null).map(stripNulls);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null).map(([k, x]) => [k, stripNulls(x)]));
  return v;
}

type Common = { jobId: string; logFile: string; feedback?: string; humanNote?: string; resume?: string; env: NodeJS.ProcessEnv; onSpawn?: (pid: number) => void };

export const onboarder = (c: Common & { input: OnboarderInput }) =>
  runAgent({ ...c, role: "onboarder", promptFile: "onboarder.md", cwd: c.input.repoPath, schema: S.Profile, example: EXAMPLES.profile });

export const pm = (c: Common & { cwd: string; input: PmInput }) =>
  runAgent({ ...c, role: "pm", promptFile: "pm.md", schema: S.Spec, example: EXAMPLES.spec });

export const architect = (c: Common & { cwd: string; input: ArchitectInput }) =>
  runAgent({ ...c, role: "architect", promptFile: "architect.md", schema: S.Plan, example: EXAMPLES.plan });

export const repairer = (c: Common & { cwd: string; input: RepairInput }) =>
  runAgent({ ...c, role: "architect", promptFile: "repair.md", schema: S.RepairResult, example: { packet: EXAMPLES.plan.packets[0], followUps: [] } });

export const completer = (c: Common & { cwd: string; input: CompleteInput }) =>
  runAgent({ ...c, role: "architect", promptFile: "complete.md", schema: S.Completion, example: { packets: [EXAMPLES.plan.packets[0]], note: "Adds the missing win-detection tests." } });

export const reporter = (c: Common & { cwd: string; input: ReportInput }) =>
  runAgent({ ...c, role: "pm", promptFile: "report.md", schema: S.FinalReport, example: EXAMPLES.finalReport });
export const worker = (c: Common & { cwd: string; input: WorkerInput; preface: string }) =>
  runAgent({ ...c, role: "worker", promptFile: "worker.md", schema: S.WorkerReport, example: EXAMPLES.report, optional: true });

const EXAMPLES = {
  profile: {
    summary: "Checkout service: a Hono API over Postgres with a Next.js admin. Tests run with bun.",
    stack: ["TypeScript", "Hono", "Postgres", "Next.js"],
    commands: { setup: "bun install", test: "bun test", typecheck: "bun run typecheck" },
    structure: [{ path: "apps/api/", purpose: "HTTP API" }, { path: "db/migrations/", purpose: "schema migrations" }],
    rules: [
      { id: "R1", text: "Never edit an applied migration; add a new one.", source: "company rules", category: "security", criticality: "critical", protectedPaths: ["db/migrations/**"] },
      { id: "R2", text: "React components use PascalCase file names.", source: "company rules", category: "naming", criticality: "normal", protectedPaths: [] },
    ],
    findings: [
      { ruleId: "R1", status: "ok", evidence: "db/migrations/ holds 41 files, none edited after their first commit.", suggestion: "" },
      { ruleId: "R2", status: "violated", evidence: "apps/admin/components/order-table.tsx is kebab-case.", suggestion: "Rename in a separate clean-up task; not a blocker." },
    ],
    adaptations: [{ setting: "proof command", value: "bun test", why: "The suite runs offline in under a minute." }],
    toolchain: { packageManager: "bun", lockfile: "bun.lock", runtimes: [{ name: "bun", version: "1.3.6", source: "package.json packageManager" }] },
    dependencies: [{ name: "hono", version: "4.12.2" }, { name: "next", version: "15.5.20" }],
    envVars: [{ name: "DATABASE_URL", source: ".env.example" }],
    decisions: [{ text: "Money is stored as integer paise, never floats.", why: "Rounding errors on refunds", source: "docs/adr/0003-money.md" }],
    houseRules: [
      { id: "H-FILESIZE", outcome: "replace", why: "Company rule: files up to 800 lines.", settings: { maxLines: 800 } },
      { id: "H-DOCS", outcome: "replace", why: "Design docs are required in docs/design/.", settings: { allowPaths: ["docs/design/**"] } },
      { id: "H-TESTS", outcome: "keep", why: "" },
    ],
    recommendation: { decision: "continue", reason: "The only mismatch is a naming convention — nothing critical.", suggestions: [] },
  },
  spec: {
    title: "Let support staff refund part of an order",
    intent: "Support can refund a chosen amount (not only the full order) and the customer's receipt shows it.",
    methodology: { mode: "one_shot", why: "One outcome, three small changes that don't depend on each other's results." },
    acceptance: [{ id: "A1", statement: "A ₹1,000 order refunded ₹300 shows ₹700 paid and one ₹300 refund line.", check: "bun test apps/api/test/refunds.test.ts" }],
    outOfScope: ["Refunds to a different payment method"],
    risk: "high",
    questions: [{ id: "Q1", question: "A ₹1,000 order with a ₹100 discount: can support refund up to ₹1,000 or only up to the ₹900 actually paid?", options: ["Up to ₹900 paid", "Up to ₹1,000"] }],
    rulesTouched: ["R1"],
  },
  plan: {
    summary: "Add a refunds table and endpoint, then show refund lines on the receipt.",
    modules: [{ id: "M1", title: "Partial refunds", context: "Money is stored in paise as integers everywhere." }],
    packets: [
      {
        id: "P1", module: "M1", title: "Refund endpoint", objective: "POST /orders/:id/refunds records a partial refund",
        context: "apps/api/src/orders.ts:88 createOrder() shows the transaction pattern to mirror.",
        files: ["apps/api/src/refunds.ts", "apps/api/test/refunds.test.ts"], deps: [],
        verification: ["bun test apps/api/test/refunds.test.ts"], regression: ["bun test"], risk: "high",
        kind: "change", newDependencies: [], env: [],
      },
    ],
    rulesImpact: [{ ruleId: "R1", impact: "Needs a NEW migration file; no existing migration is edited.", conflict: false }],
    advice: { decision: "continue", reason: "The migration rule is respected — the plan only adds a file.", suggestions: [] },
    nextPhases: [],
  },
  report: { status: "implemented", summary: "Added the endpoint and three tests.", needsYou: "", newFacts: ["Orders store money in paise."] },
  finalReport: {
    summary: "Support can now refund part of an order from the order page; the receipt shows the refund as its own line.",
    view: { how: "server", entry: "/admin/orders", command: "bun run dev" },
    criteria: [{ id: "A1", verdict: "met", evidence: "apps/api/test/refunds.test.ts 'partial refund of 300 leaves 700 paid' passes in Arrow's run; receipt.tsx:41 renders refund lines." }],
    forYou: ["Open an order at /admin/orders, refund part of it, and check the receipt reads the way support expects."],
    notes: ["Refunds to a different payment method are out of scope, as the spec says."],
  },
};
