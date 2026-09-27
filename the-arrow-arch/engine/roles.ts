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
import { driverFor, LIMITS, PROMPTS_DIR, type DriverName } from "./config";
import { classifyExit } from "./failures";
import * as S from "./schemas";
import type { Failure, Packet, Profile, Role, Rule, Spec } from "./types";

export type OnboarderInput = { repoPath: string; repoUrl: string; rulesText: string };
export type PmInput = { task: string; profile: Profile };
export type ArchitectInput = { taskId: string; task: string; spec: Spec; answers: Record<string, string>; profile: Profile };
export type RepairInput = { taskId: string; packet: Packet; failure: Failure; profile: Profile };
export type WorkerInput = { packet: Packet; attempt: number; previous?: Failure; commands: Profile["commands"]; rules: Rule[] };

const DRIVERS: Record<DriverName, Driver> = { mock, claude, bob };

type Run<T> = { result?: T; failure?: Failure; exit: AgentExit; driver: DriverName };

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
  resume?: string;
  optional?: boolean; // the worker's report is a courtesy; its checks decide
}): Promise<Run<T>> {
  const driver = driverFor(o.role);
  const outFile = path.join(o.cwd, ".arrow", "out", `${o.jobId}.json`);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.rmSync(outFile, { force: true });
  fs.mkdirSync(path.dirname(o.logFile), { recursive: true });

  const prompt = [
    fs.readFileSync(path.join(PROMPTS_DIR, o.promptFile), "utf8").trim(),
    "",
    "# Inputs",
    "",
    "```json",
    JSON.stringify(o.input, null, 2),
    "```",
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
    "",
    "Arrow validates that file. Anything you print instead is ignored.",
  ].join("\n");

  const exit = await DRIVERS[driver]({
    role: o.role, jobId: o.jobId, cwd: o.cwd, prompt, outFile, logFile: o.logFile,
    timeoutMs: LIMITS.agentTimeoutMs, resume: o.resume, input: o.input,
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
  const parsed = o.schema.safeParse(raw);
  if (!parsed.success) {
    if (o.optional) return { exit, driver };
    const why = parsed.error.issues.slice(0, 6).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    return { failure: { class: "bad_output", message: `The result didn't match the required shape — ${why}` }, exit, driver };
  }
  return { result: parsed.data, exit, driver };
}

type Common = { jobId: string; logFile: string; feedback?: string; resume?: string };

export const onboarder = (c: Common & { input: OnboarderInput }) =>
  runAgent({ ...c, role: "onboarder", promptFile: "onboarder.md", cwd: c.input.repoPath, schema: S.Profile, example: EXAMPLES.profile });

export const pm = (c: Common & { cwd: string; input: PmInput }) =>
  runAgent({ ...c, role: "pm", promptFile: "pm.md", schema: S.Spec, example: EXAMPLES.spec });

export const architect = (c: Common & { cwd: string; input: ArchitectInput }) =>
  runAgent({ ...c, role: "architect", promptFile: "architect.md", schema: S.Plan, example: EXAMPLES.plan });

export const repairer = (c: Common & { cwd: string; input: RepairInput }) =>
  runAgent({ ...c, role: "architect", promptFile: "repair.md", schema: S.Packet, example: EXAMPLES.plan.packets[0] });

export const worker = (c: Common & { cwd: string; input: WorkerInput }) =>
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
      },
    ],
    rulesImpact: [{ ruleId: "R1", impact: "Needs a NEW migration file; no existing migration is edited." }],
    advice: { decision: "continue", reason: "The migration rule is respected — the plan only adds a file.", suggestions: [] },
  },
  report: { status: "implemented", summary: "Added the endpoint and three tests.", newFacts: ["Orders store money in paise."] },
};
