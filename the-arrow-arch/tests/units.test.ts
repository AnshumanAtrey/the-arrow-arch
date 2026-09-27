import { describe, expect, test } from "bun:test";
import { isCommand } from "../engine/accept";
import { stats as bobStats } from "../engine/agents/bob";
import { stepPolicy } from "../engine/decide";
import { classifyExit } from "../engine/failures";
import { onboardingGate, planGate } from "../engine/gate";
import { DEFAULTS, effectiveSettings, HouseSettings } from "../engine/house-rules";
import { matches, overlaps } from "../engine/glob";
import { planProblem } from "../engine/orchestrator";
import { project } from "../engine/project";
import * as S from "../engine/schemas";
import { allowedValues } from "../engine/schema-hints";
import type { ArrowEvent, JobView, Plan, Profile, Spec } from "../engine/types";
import { z } from "zod";

const at = "2026-09-27T00:00:00.000Z";

describe("glob", () => {
  test("directories, stars and double stars", () => {
    expect(matches("db/migrations/001.sql", "db/migrations/**")).toBe(true);
    expect(matches("db/migrations/001.sql", "db/migrations")).toBe(true);
    expect(matches("db/seed.sql", "db/migrations/**")).toBe(false);
    expect(matches("src/a.ts", "src/*.ts")).toBe(true);
    expect(matches("src/x/a.ts", "src/*.ts")).toBe(false);
    expect(matches("src/x/a.ts", "src/**/*.ts")).toBe(true);
  });
  test("overlap errs towards yes", () => {
    expect(overlaps("src/a.ts", "src/**")).toBe(true);
    expect(overlaps("src/**", "src/api/**")).toBe(true);
    expect(overlaps("src/a.ts", "src/b.ts")).toBe(false);
  });
});

describe("failure classes", () => {
  test("provider marks count only in the tail, and only on a non-zero exit", () => {
    expect(classifyExit({ exitCode: 1, timedOut: false, tail: "…You've hit your spend limit" })?.class).toBe("provider");
    expect(classifyExit({ exitCode: 0, timedOut: false, tail: "rate limit" })).toBeUndefined();
    expect(classifyExit({ exitCode: 1, timedOut: false, tail: "TypeError: x is undefined" })?.class).toBe("internal");
    expect(classifyExit({ exitCode: 0, timedOut: true, tail: "" })?.class).toBe("timeout");
  });
});

describe("loop manager policy", () => {
  const run = (p: Partial<JobView>): JobView => ({ jobId: "j", role: "pm", subject: "T1:pm", attempt: 1, driver: "mock", startedAt: at, finishedAt: at, ...p });
  const now = Date.parse(at);
  test("first run goes", () => expect(stepPolicy([], now)).toEqual({ go: true, attempt: 1 }));
  test("a provider outage waits, then reruns the SAME attempt", () => {
    const r = [run({ ok: false, failure: { class: "provider", message: "429" } })];
    expect(stepPolicy(r, now).go).toBe(false);
    expect(stepPolicy(r, now + 60_000)).toMatchObject({ go: true, attempt: 1 });
  });
  test("a timeout parks with work kept — never an automatic rerun", () => {
    const st = stepPolicy([run({ ok: false, failure: { class: "timeout", message: "t" } })], now);
    expect(st.go).toBe(false);
    expect(st).toHaveProperty("park");
  });
  test("bad output gets one retry with feedback, then parks", () => {
    const bad = (a: number) => run({ attempt: a, ok: false, failure: { class: "bad_output", message: "missing title" } });
    expect(stepPolicy([bad(1)], now)).toMatchObject({ go: true, attempt: 2, feedback: "missing title" });
    expect(stepPolicy([bad(1), bad(2)], now)).toHaveProperty("park");
  });
});

const profile = (over: Partial<Profile> = {}): Profile => ({
  summary: "s", stack: [], commands: {}, structure: [], adaptations: [],
  toolchain: { runtimes: [] }, dependencies: [], envVars: [], decisions: [], houseRules: [],
  rules: [
    { id: "R1", text: "Never edit db/migrations", source: "x", category: "security", criticality: "critical", protectedPaths: ["db/migrations/**"] },
    { id: "R2", text: "Use PascalCase components", source: "x", category: "naming", criticality: "normal", protectedPaths: [] },
  ],
  findings: [
    { ruleId: "R1", status: "ok", evidence: "", suggestion: "" },
    { ruleId: "R2", status: "violated", evidence: "one file", suggestion: "rename later" },
  ],
  recommendation: { decision: "continue", reason: "fine", suggestions: [] },
  ...over,
});

describe("rules gate", () => {
  test("only a normal rule broken: green, with a warning", () => {
    const g = onboardingGate(profile());
    expect(g.verdict).toBe("green");
    expect(g.items.some((i) => i.level === "warning")).toBe(true);
  });
  test("a critical rule broken: red", () => {
    const p = profile();
    p.findings[0].status = "violated";
    expect(onboardingGate(p).verdict).toBe("red");
  });
  test("an unchecked critical rule is not silently fine", () => {
    expect(onboardingGate(profile({ findings: [] })).verdict).toBe("red");
  });
  const spec: Spec = { title: "t", intent: "i", methodology: { mode: "one_shot", why: "w" }, acceptance: [{ id: "A1", statement: "s", check: "c" }], outOfScope: [], risk: "low", questions: [], rulesTouched: [] };
  const plan = (files: string[]): Plan => ({
    summary: "s", modules: [], rulesImpact: [], advice: { decision: "continue", reason: "r", suggestions: [] },
    packets: [{ id: "P1", module: "M1", title: "t", objective: "o", context: "", files, deps: [], verification: ["true"], regression: [], risk: "low", kind: "change", newDependencies: [], env: [] }],
  });
  test("a packet that may touch a protected path turns the plan red — computed, not judged", () => {
    expect(planGate("T1", plan(["src/a.ts"]), spec, profile().rules, DEFAULTS).verdict).toBe("green");
    expect(planGate("T1", plan(["db/migrations/002.sql"]), spec, profile().rules, DEFAULTS).verdict).toBe("red");
  });
  test("a critical rule the plan reports as respected is a note, not a stop", () => {
    const p = plan(["src/a.ts"]);
    p.rulesImpact = [{ ruleId: "R1", impact: "Untouched: no migration is created, read or committed.", conflict: false }];
    const g = planGate("T1", p, spec, profile().rules, DEFAULTS);
    expect(g.verdict).toBe("green");
    expect(g.items.find((i) => i.ruleId === "R1")?.level).toBe("ok");
  });
  test("a critical rule the plan bends is the human's call", () => {
    const p = plan(["src/a.ts"]);
    p.rulesImpact = [{ ruleId: "R1", impact: "The column has to change in the applied migration.", conflict: true }];
    const g = planGate("T1", p, spec, profile().rules, DEFAULTS);
    expect(g.verdict).toBe("red");
    expect(g.items.find((i) => i.ruleId === "R1")?.level).toBe("critical");
  });
  test("the architect's own advice to stop still turns the plan red", () => {
    const p = plan(["src/a.ts"]);
    p.advice = { decision: "stop", reason: "This cannot be done safely.", suggestions: [] };
    expect(planGate("T1", p, spec, profile().rules, DEFAULTS).verdict).toBe("red");
  });
});

describe("plan sanity", () => {
  const pk = (id: string, deps: string[] = []) => ({ id, module: "M1", title: "t", objective: "o", context: "", files: ["a"], deps, verification: ["true"], regression: [], risk: "low" as const, kind: "change" as const, newDependencies: [], env: [] });
  const plan = (packets: ReturnType<typeof pk>[]): Plan => ({ summary: "s", modules: [], packets, rulesImpact: [], advice: { decision: "continue", reason: "r", suggestions: [] } });
  test("catches duplicate ids, missing deps and cycles", () => {
    expect(planProblem(plan([pk("P1"), pk("P1")]))).toContain("twice");
    expect(planProblem(plan([pk("P1", ["P9"])]))).toContain("P9");
    expect(planProblem(plan([pk("P1", ["P2"]), pk("P2", ["P1"])]))).toContain("loop");
    expect(planProblem(plan([pk("P1"), pk("P2", ["P1"])]))).toBeUndefined();
  });
});

describe("projection", () => {
  test("provider outages don't count as attempts", () => {
    const ev = (e: object) => ({ at, ...e }) as ArrowEvent;
    const plan: Plan = {
      summary: "s", modules: [], rulesImpact: [], advice: { decision: "continue", reason: "r", suggestions: [] },
      packets: [{ id: "P1", module: "M1", title: "t", objective: "o", context: "", files: ["a"], deps: [], verification: ["true"], regression: [], risk: "low", kind: "change", newDependencies: [], env: [] }],
    };
    const s = project("p", [
      ev({ type: "project.created", name: "p", repoUrl: "/x", rulesText: "" }),
      ev({ type: "task.submitted", taskId: "T1", text: "do" }),
      ev({ type: "plan.ready", taskId: "T1", plan, branch: "arrow/t1", base: "abc" }),
      ev({ type: "job.started", jobId: "j1", role: "worker", subject: "T1:P1:work", attempt: 1, driver: "mock" }),
      ev({ type: "job.finished", jobId: "j1", ok: false, failure: { class: "provider", message: "429" }, durationMs: 1 }),
      ev({ type: "job.started", jobId: "j2", role: "worker", subject: "T1:P1:work", attempt: 1, driver: "mock" }),
      ev({ type: "job.finished", jobId: "j2", ok: true, durationMs: 1 }),
    ]);
    expect(s.tasks.T1.packets.P1.attempts).toBe(1);
    expect(s.tasks.T1.packets.P1.status).toBe("built");
  });
});

describe("Bob Shell output", () => {
  const result = { type: "result", timestamp: "t", status: "success", stats: { task_id: "task-42", total_tokens: 1500, input_tokens: 1200, output_tokens: 300, cache_read_tokens: 800, duration_ms: 9000, session_costs: 0.7, tool_calls: 4 }, last_message: "done" };
  test("reads tokens, bobcoins and the task id from one-line JSON after log lines", () => {
    const s = bobStats(`starting...\nreading files\n${JSON.stringify(result)}\n`);
    expect(s).toMatchObject({ sessionId: "task-42", cost: 0.7, costUnit: "bobcoins", usage: { input: 1200, output: 300, cacheRead: 800, total: 1500 } });
  });
  test("reads pretty-printed JSON too", () => {
    expect(bobStats(JSON.stringify(result, null, 2)).sessionId).toBe("task-42");
  });
  test("no JSON means no numbers, not a crash", () => {
    expect(bobStats("Error: Bob API key is required.")).toEqual({});
  });
});

describe("schema hints", () => {
  test("closed sets reach the prompt, read off the schema itself", () => {
    const hints = allowedValues(S.Profile);
    expect(hints).toContain("rules[].category: structure | naming | code | testing | security | process | other");
    expect(hints).toContain("recommendation.decision: continue | stop");
    expect(allowedValues(S.Plan)).toContain("packets[].kind: change | refactor");
  });
  test("a set used in two places is listed for both", () => {
    expect(allowedValues(S.Plan).filter((h) => h.startsWith("advice.decision:"))).toEqual(["advice.decision: continue | stop"]);
    expect(allowedValues(S.WorkerReport)).toContain("status: implemented | blocked");
  });
  test("every role's schema converts, and a hint never costs a run", () => {
    for (const s of [S.Profile, S.Spec, S.Plan, S.Packet, S.WorkerReport]) expect(() => allowedValues(s)).not.toThrow();
    expect(allowedValues(z.object({ a: z.string() }))).toEqual([]); // nothing closed, nothing to say
  });
});

describe("house settings schema", () => {
  test("a stored tests outcome that only names mayEditExisting keeps the new field's default", () => {
    // onboarding wrote { mayEditExisting: true } before requireApprovalForNewSkips
    // existed. Merged over the defaults it must still parse — a missing field
    // would drop the company's whole tests setting, silently.
    const h = effectiveSettings([{ id: "H-TESTS", outcome: "conflict", why: "", settings: { mayEditExisting: true } }], true);
    expect(h.tests.mayEditExisting).toBe(true);
    expect(h.tests.requireApprovalForNewSkips).toBe(true);
    expect(DEFAULTS.tests.requireApprovalForNewSkips).toBe(true);
    // the field's own default: a tests object that omits it parses, and reads as on
    expect(HouseSettings.shape.tests.parse({ mayEditExisting: true }).requireApprovalForNewSkips).toBe(true);
    expect(effectiveSettings([{ id: "H-TESTS", outcome: "replace", why: "", settings: { requireApprovalForNewSkips: false } }], true).tests.requireApprovalForNewSkips).toBe(false);
  });
});

describe("acceptance checks", () => {
  test("commands are run; checks for a person, and GUI commands, never are", async () => {
    expect(await isCommand("npm test -- win-detection")).toBe(true);
    expect(await isCommand("test -s index.html")).toBe(true);
    expect(await isCommand("manual: open index.html with wifi off")).toBe(false);
    expect(await isCommand("open index.html")).toBe(false);
    expect(await isCommand("each packet's verification commands pass")).toBe(false);
    expect(await isCommand("Open index.html directly in a browser and confirm it works")).toBe(false); // macOS: `open` would launch a browser
    expect(await isCommand("Tab/arrow/enter through a full round")).toBe(false);
    expect(await isCommand("./scripts/check.sh")).toBe(true);
  });
});
