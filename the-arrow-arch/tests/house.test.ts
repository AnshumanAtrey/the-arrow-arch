import { describe, expect, test } from "bun:test";
import { dependencyCheck, diffBudgetCheck, docsCheck, fileSizeCheck, newDependencies, placeholderCheck, secretCheck, type FileFacts } from "../engine/checks";
import { decide } from "../engine/decide";
import { DEFAULTS, effectiveSettings } from "../engine/house-rules";
import { buildLedger, freeSlot, ledgerBrief, type OsSnapshot } from "../engine/ledger";
import { project } from "../engine/project";
import type { ArrowEvent, Plan, Profile } from "../engine/types";

const f = (path: string, over: Partial<FileFacts> = {}): FileFacts => ({ path, added: false, linesNow: 10, linesBefore: 10, addedLines: [], ...over });

describe("house-rule checks", () => {
  test("file size: new files over the cap fail; an old big file may stay but not grow", () => {
    const s = DEFAULTS.fileSize;
    expect(fileSizeCheck([f("src/a.ts", { added: true, linesNow: 501, linesBefore: 0 })], s)?.class).toBe("scope");
    expect(fileSizeCheck([f("src/a.ts", { linesNow: 520, linesBefore: 480 })], s)).toBeDefined(); // crossed the cap
    expect(fileSizeCheck([f("src/big.ts", { linesNow: 900, linesBefore: 950 })], s)).toBeUndefined(); // shrank
    expect(fileSizeCheck([f("src/big.ts", { linesNow: 960, linesBefore: 950 })], s)).toBeDefined(); // grew
    expect(fileSizeCheck([f("db/migrations/001.sql", { added: true, linesNow: 2000 })], s)).toBeUndefined(); // exempt
  });
  test("docs: no new markdown, except where the company keeps docs", () => {
    expect(docsCheck([f("notes/plan.md", { added: true })], DEFAULTS.docs)?.class).toBe("scope");
    expect(docsCheck([f("README.md")], DEFAULTS.docs)).toBeUndefined(); // editing an existing doc is fine
    expect(docsCheck([f("docs/design/x.md", { added: true })], { allowPaths: ["docs/design/**"] })).toBeUndefined();
  });
  test("placeholders: stubs fail, unless in the company's ticket format", () => {
    const stub = [f("src/a.ts", { addedLines: ["  // TODO implement refunds"] })];
    expect(placeholderCheck(stub, DEFAULTS.placeholders)).toBeDefined();
    expect(placeholderCheck([f("src/a.ts", { addedLines: ["// TODO(PAY-12) handle partials"] })], { allowedPattern: "TODO\\([A-Z]+-\\d+\\)" })).toBeUndefined();
    expect(placeholderCheck([f("src/a.ts", { addedLines: ["const todos = load();"] })], DEFAULTS.placeholders)).toBeUndefined();
  });
  test("secrets: key-shaped strings are caught; ordinary code isn't", () => {
    expect(secretCheck([f("src/a.ts", { addedLines: ['const k = "AKIAABCDEFGHIJKLMNOP";'] })])?.class).toBe("protected");
    expect(secretCheck([f("src/a.ts", { addedLines: ['password = "hunter2hunter2hunter2"'] })])).toBeDefined();
    expect(secretCheck([f("src/a.ts", { addedLines: ["const url = `/task-appmapdebugsourcesetpaths-error`;"] })])).toBeUndefined();
  });
  test("dependencies: only what the plan named, or the company pre-approved", () => {
    const before = JSON.stringify({ dependencies: { react: "19" } });
    const after = JSON.stringify({ dependencies: { react: "19", zod: "4", lodash: "4" } });
    const added = newDependencies("package.json", before, after);
    expect(added.sort()).toEqual(["lodash", "zod"]);
    expect(dependencyCheck(added, ["zod"], DEFAULTS.dependencies)?.message).toContain("lodash");
    expect(dependencyCheck(added, ["zod"], { requireApproval: true, approved: ["lodash"] })).toBeUndefined();
    expect(newDependencies("requirements.txt", "flask==3\n", "flask==3\nrequests>=2\n")).toEqual(["requests"]);
  });
  test("diff budget", () => {
    expect(diffBudgetCheck(401, DEFAULTS.diff)).toBeDefined();
    expect(diffBudgetCheck(400, DEFAULTS.diff)).toBeUndefined();
  });
});

describe("onboarding tunes the house rules", () => {
  test("a normal rule the company replaces applies at once", () => {
    const h = effectiveSettings([{ id: "H-FILESIZE", outcome: "replace", why: "", settings: { maxLines: 800 } }]);
    expect(h.fileSize.maxLines).toBe(800);
    expect(h.fileSize.targetLines).toBe(300);
  });
  test("a critical rule the company contradicts applies only after a person approves", () => {
    const o = [{ id: "H-TESTS", outcome: "conflict" as const, why: "", settings: { mayEditExisting: true } }];
    expect(effectiveSettings(o, false).tests.mayEditExisting).toBe(false);
    expect(effectiveSettings(o, true).tests.mayEditExisting).toBe(true);
  });
  test("settings that don't make sense are ignored, not trusted", () => {
    expect(effectiveSettings([{ id: "H-FILESIZE", outcome: "replace", why: "", settings: { maxLines: -5 } }]).fileSize.maxLines).toBe(500);
  });
});

const at = "2026-09-27T00:00:00.000Z";
const ev = (e: object) => ({ at, ...e }) as ArrowEvent;
const plan: Plan = {
  summary: "s", modules: [], rulesImpact: [], advice: { decision: "continue", reason: "r", suggestions: [] },
  packets: ["P1", "P2"].map((id) => ({ id, module: "M1", title: id, objective: "o", context: "", files: [`src/${id}.ts`], deps: [], verification: ["true"], regression: [], risk: "low" as const, kind: "change" as const, newDependencies: [], env: [] })),
};
const prof: Profile = {
  summary: "s", stack: [], commands: {}, structure: [], rules: [], findings: [], adaptations: [], toolchain: { runtimes: [] }, dependencies: [], envVars: [], decisions: [], houseRules: [],
  recommendation: { decision: "continue", reason: "r", suggestions: [] },
};
const base = [
  ev({ type: "project.created", name: "p", repoUrl: "/x", rulesText: "" }),
  ev({ type: "repo.cloned", path: "/d/p/repo", branch: "main", head: "abc" }),
  ev({ type: "profile.ready", profile: prof }),
  ev({ type: "gate.opened", gate: { id: "onboarding", kind: "onboarding", subject: "project", verdict: "green", items: [], recommendation: prof.recommendation } }),
  ev({ type: "gate.decided", gateId: "onboarding", decision: "approve" }),
  ev({ type: "task.submitted", taskId: "T1", text: "do it" }),
  ev({ type: "spec.ready", taskId: "T1", spec: { title: "t", intent: "i", methodology: { mode: "one_shot", why: "w" }, acceptance: [{ id: "A1", statement: "s", check: "c" }], outOfScope: [], risk: "low", questions: [], rulesTouched: [] } }),
  ev({ type: "plan.ready", taskId: "T1", plan, branch: "arrow/t1", base: "abc" }),
  ev({ type: "gate.opened", gate: { id: "plan-T1", kind: "plan", subject: "T1", verdict: "green", items: [], recommendation: prof.recommendation } }),
  ev({ type: "gate.decided", gateId: "plan-T1", decision: "approve" }),
];

describe("loop manager", () => {
  test("packets are prepared before any worker runs, in parallel when their files don't overlap", () => {
    const kinds = decide(project("p", base), Date.parse(at)).map((a) => a.kind);
    expect(kinds).toEqual(["prepare", "prepare"]);
  });
  test("a freeze stops new work", () => {
    expect(decide(project("p", [...base, ev({ type: "project.frozen", frozen: true })]), Date.parse(at))).toEqual([]);
  });
  test("checks that already pass go back to the architect; a broken install parks for a person", () => {
    const s = project("p", [
      ...base,
      ev({ type: "packet.failed", taskId: "T1", packetId: "P1", failure: { class: "bad_check", message: "already passes" } }),
      ev({ type: "packet.failed", taskId: "T1", packetId: "P2", failure: { class: "environment", message: "npm ci failed" } }),
    ]);
    const acts = decide(s, Date.parse(at));
    expect(acts).toContainEqual({ kind: "repair", taskId: "T1", packetId: "P1", attempt: 1 });
    expect(acts).toContainEqual({ kind: "park", subject: "T1:P2:work", reason: "npm ci failed" });
  });
});

describe("ledger", () => {
  const dirs = { project: "/d/p", worktrees: "/d/p/worktrees" };
  const events = [
    ...base,
    ev({ type: "job.started", jobId: "w1", role: "worker", subject: "T1:P1:work", attempt: 1, driver: "mock", port: 4100 }),
    ev({ type: "job.spawned", jobId: "w1", pid: 500 }),
    ev({ type: "job.started", jobId: "w0", role: "worker", subject: "T1:P2:work", attempt: 1, driver: "mock" }),
    ev({ type: "job.spawned", jobId: "w0", pid: 600 }),
    ev({ type: "job.finished", jobId: "w0", ok: true, durationMs: 1 }),
  ];
  const os: OsSnapshot = {
    selfPid: 1,
    procs: [
      { pid: 500, pgid: 500, command: "claude" }, //  running worker
      { pid: 601, pgid: 600, command: "node" }, //    left behind by a finished worker, inside Arrow's folder
      { pid: 602, pgid: 600, command: "chrome" }, //  same group, outside Arrow's folders — pid reuse is possible
      { pid: 700, pgid: 700, command: "postgres" }, // not Arrow's at all
    ],
    listening: [{ pid: 601, port: 4110 }, { pid: 700, port: 5432 }],
    cwds: { 500: "/d/p/worktrees/T1--P1", 601: "/d/p/worktrees/T1--P2", 602: "/Users/me", 700: "/usr/local/var" },
    worktrees: [{ path: "/d/p/repo", branch: "main" }, { path: "/d/p/worktrees/T1--P1", branch: "arrow/t1--p1" }, { path: "/d/p/worktrees/T9--P1", branch: "arrow/t9--p1" }],
  };
  const l = buildLedger(project("p", events), os, dirs, at);

  test("only an orphan inside Arrow's folders is stale; anything else is never touched", () => {
    const pg = l.stale.filter((x) => x.kind === "process").map((x) => x.pgid);
    expect(pg).toEqual([600]);
    expect(l.stale.some((x) => x.what.includes("postgres") || x.what.includes("chrome"))).toBe(false);
  });
  test("a worktree no packet owns is stale; a busy one is in use", () => {
    expect(l.worktrees.find((w) => w.packet === "T9/P1")?.status).toBe("stale");
    expect(l.worktrees.find((w) => w.packet === "T1/P1")?.status).toBe("in use");
  });
  test("ports: a new worker gets a range nobody is using", () => {
    expect(freeSlot(l, DEFAULTS.ports, [4100])).toBe(2); // 4100s taken by w1, 4110s by the orphan's server
    const brief = ledgerBrief(l, { packet: "T1/P2", port: 4120, h: DEFAULTS.ports });
    expect(brief).toContain("T1/P1");
    expect(brief).toContain("4120–4129");
  });
});
