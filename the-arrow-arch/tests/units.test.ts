import { describe, expect, test } from "bun:test";
import { stepPolicy } from "../engine/decide";
import { classifyExit } from "../engine/failures";
import { onboardingGate, planGate } from "../engine/gate";
import { matches, overlaps } from "../engine/glob";
import { planProblem } from "../engine/orchestrator";
import { project } from "../engine/project";
import type { ArrowEvent, JobView, Plan, Profile, Spec } from "../engine/types";

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
    packets: [{ id: "P1", module: "M1", title: "t", objective: "o", context: "", files, deps: [], verification: ["true"], regression: [], risk: "low" }],
  });
  test("a packet that may touch a protected path turns the plan red — computed, not judged", () => {
    expect(planGate("T1", plan(["src/a.ts"]), spec, profile().rules).verdict).toBe("green");
    expect(planGate("T1", plan(["db/migrations/002.sql"]), spec, profile().rules).verdict).toBe("red");
  });
});

describe("plan sanity", () => {
  const pk = (id: string, deps: string[] = []) => ({ id, module: "M1", title: "t", objective: "o", context: "", files: ["a"], deps, verification: ["true"], regression: [], risk: "low" as const });
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
      packets: [{ id: "P1", module: "M1", title: "t", objective: "o", context: "", files: ["a"], deps: [], verification: ["true"], regression: [], risk: "low" }],
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
