/**
 * The whole flow, for real, with the mock engine: a throwaway git repo is
 * onboarded, a task goes PM -> architect -> plan check -> parallel workers ->
 * the orchestrator's own verification -> merge -> landed on a branch.
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

setDefaultTimeout(60_000); // real git + real shell checks

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "arrow-e2e-"));
process.env.ARROW_DATA = path.join(tmp, "data");
process.env.ARROW_DRIVER = "mock";
process.env.ARROW_MOCK_DELAY_MS = "1";

const { tick, reconcile } = await import("../engine/orchestrator");
const { refreshLedger, readLedger } = await import("../engine/ledger-scan");
const { verifyPacket } = await import("../engine/verify");
const { DEFAULTS } = await import("../engine/house-rules");
const store = await import("../engine/store");
const { project } = await import("../engine/project");
type State = ReturnType<typeof project>;
type Packet = import("../engine/types").Packet;
type Profile = import("../engine/types").Profile;

const repo = path.join(tmp, "sample");
const sh = (cwd: string, ...args: string[]) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();

beforeAll(() => {
  fs.mkdirSync(path.join(repo, "src"), { recursive: true });
  fs.mkdirSync(path.join(repo, "db/migrations"), { recursive: true });
  fs.writeFileSync(path.join(repo, "package.json"), JSON.stringify({ name: "sample", scripts: { test: "true" } }));
  fs.writeFileSync(path.join(repo, "src/index.ts"), "export const hi = 1;\n");
  fs.writeFileSync(path.join(repo, "db/migrations/001.sql"), "create table t (id int);\n");
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  sh(repo, "add", "-A");
  sh(repo, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init");
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

async function until(pid: string, done: (s: State) => boolean, ms = 20_000): Promise<State> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    await tick(pid);
    const s = project(pid, store.readEvents(pid));
    if (done(s)) return s;
    await new Promise((r) => setTimeout(r, 25));
  }
  const s = project(pid, store.readEvents(pid));
  throw new Error(`timed out; stage=${s.stage} tasks=${JSON.stringify(Object.values(s.tasks).map((t) => [t.taskId, t.stage]))} parked=${JSON.stringify(s.parked)} notes=${JSON.stringify(s.notes)}`);
}

function start(rulesText: string) {
  const pid = store.newProjectId(repo);
  store.append(pid, { type: "project.created", name: "sample", repoUrl: repo, rulesText });
  return pid;
}

describe("green path", () => {
  test("onboard, approve, build three packets (two in parallel), land", async () => {
    const pid = start("- Never edit `db/migrations/` once applied\n- Components use PascalCase");
    let s = await until(pid, (s) => Boolean(s.onboardingGateId));
    const gate = s.gates[s.onboardingGateId!];
    expect(gate.verdict).toBe("green");
    expect(s.profile!.rules.find((r) => r.id === "R1")?.criticality).toBe("critical");

    store.append(pid, { type: "gate.decided", gateId: gate.id, decision: "approve" });
    store.append(pid, { type: "task.submitted", taskId: "T1", text: "Add a short changelog for the team." });
    s = await until(pid, (s) => Boolean(s.tasks.T1.planGateId));
    const pg = s.gates[s.tasks.T1.planGateId!];
    expect(pg.verdict).toBe("green");

    store.append(pid, { type: "gate.decided", gateId: pg.id, decision: "approve" });
    s = await until(pid, (s) => s.tasks.T1.stage === "landed");

    const t = s.tasks.T1;
    expect(t.order.every((p) => t.packets[p].status === "merged")).toBe(true);
    // P1 and P2 touch different files, so they were allowed to run at the same time
    const work = Object.values(s.jobs).filter((j) => j.role === "worker");
    expect(work.length).toBe(3);
    const files = sh(s.repo!.path, "ls-tree", "-r", "--name-only", t.landed!.branch);
    expect(files).toContain("arrow-demo/t1/index.ts");
    // the base branch was never touched, and nothing is left running
    expect(sh(s.repo!.path, "rev-parse", "main")).toBe(s.repo!.head);
    expect(Object.values(s.jobs).every((j) => j.finishedAt)).toBe(true);

    // a second task starts on top of the first: tasks stack on arrow/main
    store.append(pid, { type: "task.submitted", taskId: "T2", text: "Add a second small helper for the team." });
    s = await until(pid, (s) => Boolean(s.tasks.T2?.planGateId));
    store.append(pid, { type: "gate.decided", gateId: s.tasks.T2.planGateId!, decision: "approve" });
    s = await until(pid, (s) => s.tasks.T2.stage === "landed");
    const t2 = sh(s.repo!.path, "ls-tree", "-r", "--name-only", "arrow/t2");
    expect(t2).toContain("arrow-demo/t1/index.ts");
    expect(t2).toContain("arrow-demo/t2/index.ts");
    expect(sh(s.repo!.path, "rev-parse", "arrow/main")).toBe(sh(s.repo!.path, "rev-parse", "arrow/t2"));
    expect(sh(s.repo!.path, "rev-parse", "main")).toBe(s.repo!.head);
  });
});

describe("red path", () => {
  test("a critical rule the repo breaks stops onboarding for a human, with the AI's call", async () => {
    const pid = start("- All API code lives in `api/handlers/` and must pass auth review");
    const s = await until(pid, (s) => Boolean(s.onboardingGateId));
    const gate = s.gates[s.onboardingGateId!];
    expect(gate.verdict).toBe("red");
    expect(gate.recommendation.decision).toBe("stop");
    expect(gate.items[0].level).toBe("critical");
    store.append(pid, { type: "gate.decided", gateId: gate.id, decision: "stop", note: "fix the layout first" });
    expect(project(pid, store.readEvents(pid)).stage).toBe("stopped");
  });

  test("a plan reaching into a protected path goes red and the human can stop it", async () => {
    const pid = start("- Never edit `db/migrations/` once applied");
    let s = await until(pid, (s) => Boolean(s.onboardingGateId));
    store.append(pid, { type: "gate.decided", gateId: s.onboardingGateId!, decision: "approve" });
    store.append(pid, { type: "task.submitted", taskId: "T1", text: "Add a note under db/migrations/ explaining the delete policy." });
    s = await until(pid, (s) => Boolean(s.tasks.T1.planGateId));
    const pg = s.gates[s.tasks.T1.planGateId!];
    expect(pg.verdict).toBe("red");
    expect(pg.items.some((i) => i.level === "critical" && i.ruleId === "R1")).toBe(true);
    store.append(pid, { type: "gate.decided", gateId: pg.id, decision: "stop" });
    expect(project(pid, store.readEvents(pid)).tasks.T1.stage).toBe("halted");
  });
});

describe("acceptance", () => {
  test("a spec check no packet covers is caught before landing, and the architect closes the gap", async () => {
    const pid = start("- Components use PascalCase");
    let s = await until(pid, (s) => Boolean(s.onboardingGateId));
    store.append(pid, { type: "gate.decided", gateId: s.onboardingGateId!, decision: "approve" });
    store.append(pid, { type: "task.submitted", taskId: "T1", text: "Add a helper. #gap" });
    s = await until(pid, (s) => Boolean(s.tasks.T1?.planGateId));
    store.append(pid, { type: "gate.decided", gateId: s.tasks.T1.planGateId!, decision: "approve" });
    s = await until(pid, (s) => s.tasks.T1.stage === "landed");
    const t = s.tasks.T1;
    expect(t.order).toContain("PG1"); // the completion pass added a packet
    expect(t.acceptance?.ok).toBe(true);
    expect(Object.values(s.jobs).filter((j) => j.subject === "T1:complete").length).toBe(1);
    expect(sh(s.repo!.path, "ls-tree", "-r", "--name-only", "arrow/t1")).toContain("arrow-demo/t1/gap.ts");
  });
});

describe("a plain folder", () => {
  test("a folder that isn't a git repo is onboarded from a snapshot; the folder is left untouched", async () => {
    const dir = path.join(tmp, "plain");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "PRD.md"), "# A game\nTwo players take turns.\n");
    const pid = store.newProjectId(dir);
    store.append(pid, { type: "project.created", name: "plain", repoUrl: dir, rulesText: "" });
    const s = await until(pid, (s) => Boolean(s.onboardingGateId));
    expect(sh(s.repo!.path, "ls-files")).toContain("PRD.md");
    expect(fs.existsSync(path.join(dir, ".git"))).toBe(false);
    expect(fs.readdirSync(dir)).toEqual(["PRD.md"]);
  });
});

describe("house rules at onboarding", () => {
  test("a company rule that contradicts a critical house rule turns the check red", async () => {
    const pid = start("- Engineers may update existing tests freely when behaviour changes");
    const s = await until(pid, (s) => Boolean(s.onboardingGateId));
    const g = s.gates[s.onboardingGateId!];
    expect(g.verdict).toBe("red");
    expect(g.items.find((i) => i.ruleId === "H-TESTS")?.level).toBe("critical");
  });
});

describe("ledger", () => {
  test("the orchestrator writes it, and reaps a process a finished agent left in Arrow's folder", async () => {
    const pid = start("- Components use PascalCase");
    const s = await until(pid, (s) => Boolean(s.profile));
    await until(pid, (s) => Object.values(s.jobs).every((j) => j.finishedAt));
    // something an agent "left running" in Arrow's copy of the repo
    const orphan = spawn("sleep", ["60"], { cwd: s.repo!.path, detached: true, stdio: "ignore" });
    orphan.unref();
    await new Promise((r) => setTimeout(r, 200));
    const l = await refreshLedger(pid, project(pid, store.readEvents(pid)));
    expect(l.stale.some((x) => x.kind === "process" && x.pgid === orphan.pid)).toBe(true);
    const alive = () => { try { process.kill(orphan.pid!, 0); return true; } catch { return false; } };
    for (let i = 0; i < 30 && alive(); i++) await new Promise((r) => setTimeout(r, 100)); // SIGTERM lands within ~3s even under load
    expect(alive()).toBe(false);
    expect(readLedger(pid)).not.toBeNull();
    expect(project(pid, store.readEvents(pid)).reaped.length).toBeGreaterThan(0);
  });
});

describe("state manager", () => {
  test("a job left 'running' by a crash is closed out on restart and picked up again", async () => {
    const pid = start("- Components use PascalCase");
    await until(pid, (s) => Boolean(s.repo));
    store.append(pid, { type: "job.started", jobId: "ghost", role: "onboarder", subject: "onboard", attempt: 1, driver: "mock" });
    reconcile(pid);
    const s = await until(pid, (s) => Boolean(s.profile));
    expect(s.jobs.ghost.failure?.class).toBe("internal");
    expect(s.profile).toBeDefined();
  });
});

describe("test integrity", () => {
  // the proof, against real git — the failure that got here was a one-line import
  // swap in a setup file, which the old line-counting check read as a weakened test.
  const packet: Packet = {
    id: "P1", module: "M1", title: "update the test setup", objective: "o", context: "",
    files: ["src/test/setup.ts", "src/test/a.test.ts"], deps: [], verification: ["true"],
    regression: [], risk: "low", kind: "change", newDependencies: [], env: [],
  };
  const profile: Profile = {
    summary: "s", stack: [], commands: {}, structure: [], rules: [], findings: [], adaptations: [],
    toolchain: { runtimes: [] }, dependencies: [], envVars: [], decisions: [], houseRules: [],
    recommendation: { decision: "continue", reason: "r", suggestions: [] },
  };

  /** A repo with a test suite, and the worktree a packet works in. */
  function fixture() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arrow-tests-"));
    const origin = path.join(dir, "repo");
    const wt = path.join(dir, "work");
    const put = (rel: string, body: string) => {
      fs.mkdirSync(path.dirname(path.join(origin, rel)), { recursive: true });
      fs.writeFileSync(path.join(origin, rel), body);
    };
    put("src/test/setup.ts", "import '@testing-library/jest-dom'\n");
    put("src/test/a.test.ts", "it('adds', () => {\n  expect(1 + 1).toBe(2)\n  expect(2 + 2).toBe(4)\n})\n");
    execFileSync("git", ["init", "-q", "-b", "main", origin]);
    sh(origin, "add", "-A");
    sh(origin, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init");
    sh(origin, "branch", "arrow/t1");
    sh(origin, "worktree", "add", "-q", "-b", "arrow/t1--p1", wt, "arrow/t1");
    return { dir, wt, base: "arrow/t1" };
  }

  const verify = (fix: ReturnType<typeof fixture>) =>
    verifyPacket({ wt: fix.wt, base: fix.base, packet, profile, house: DEFAULTS, attempt: 1, baseline: {}, env: process.env });

  test("rewriting a bare import in a setup file is not weakening a test", async () => {
    const fix = fixture();
    fs.writeFileSync(path.join(fix.wt, "src/test/setup.ts"), "import '@testing-library/jest-dom/vitest'\n");
    fs.writeFileSync(path.join(fix.wt, "src/test/a.test.ts"), "it('adds', () => {\n  expect(1 + 1).toBe(2)\n  expect(2 + 2).toBe(4)\n  expect(3 + 3).toBe(6)\n})\n");
    try {
      expect(await verify(fix)).toMatchObject({ ok: true });
    } finally {
      fs.rmSync(fix.dir, { recursive: true, force: true });
    }
  });

  test("deleting an assertion still fails the packet", async () => {
    const fix = fixture();
    fs.writeFileSync(path.join(fix.wt, "src/test/setup.ts"), "import '@testing-library/jest-dom/vitest'\n");
    fs.writeFileSync(path.join(fix.wt, "src/test/a.test.ts"), "it('adds', () => {\n  expect(1 + 1).toBe(2)\n})\n");
    try {
      const r = await verify(fix);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.failure).toMatchObject({ class: "verification" });
      if (!r.ok) expect(r.failure.message).toContain("Weakened");
    } finally {
      fs.rmSync(fix.dir, { recursive: true, force: true });
    }
  });

  test("deleting an existing test file still fails the packet", async () => {
    const fix = fixture();
    fs.rmSync(path.join(fix.wt, "src/test/a.test.ts"));
    try {
      const r = await verify(fix);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.failure.message).toContain("deleted");
    } finally {
      fs.rmSync(fix.dir, { recursive: true, force: true });
    }
  });

  // the chewsy packet: two tests kept every assertion, and gained a skipif that
  // made the assertion that mattered unreachable. No assertion was lost, so the
  // count saw nothing — this parks the packet for a person instead.
  test("hanging a skip off an existing test parks the packet for a person", async () => {
    const fix = fixture();
    fs.writeFileSync(path.join(fix.wt, "src/test/a.test.ts"), "it.skip('adds', () => {\n  expect(1 + 1).toBe(2)\n  expect(2 + 2).toBe(4)\n})\n");
    try {
      const r = await verify(fix);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.failure).toMatchObject({ class: "protected" });
      if (!r.ok) expect(r.failure.message).toContain("switch a test off");
    } finally {
      fs.rmSync(fix.dir, { recursive: true, force: true });
    }
  });

  /** A verify with the tests rules tuned, for the settings that decide what runs. */
  const verifyWith = (fix: ReturnType<typeof fixture>, tests: typeof DEFAULTS.tests) =>
    verifyPacket({ wt: fix.wt, base: fix.base, packet, profile, house: { ...DEFAULTS, tests }, attempt: 1, baseline: {}, env: process.env });
  const skipAdded = (fix: ReturnType<typeof fixture>) =>
    fs.writeFileSync(path.join(fix.wt, "src/test/a.test.ts"), "it.skip('adds', () => {\n  expect(1 + 1).toBe(2)\n  expect(2 + 2).toBe(4)\n})\n");

  test("with the new-skips rule off, a skip is not checked", async () => {
    const fix = fixture();
    skipAdded(fix);
    try {
      expect(await verifyWith(fix, { mayEditExisting: false, requireApprovalForNewSkips: false })).toMatchObject({ ok: true });
    } finally {
      fs.rmSync(fix.dir, { recursive: true, force: true });
    }
  });

  // the setting onboarding actually writes: a company that may edit tests still
  // gets new skips parked, because the two are separate rules
  test("mayEditExisting doesn't switch the skip rule off", async () => {
    const fix = fixture();
    skipAdded(fix);
    try {
      const r = await verifyWith(fix, { mayEditExisting: true, requireApprovalForNewSkips: true });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.failure).toMatchObject({ class: "protected" });
    } finally {
      fs.rmSync(fix.dir, { recursive: true, force: true });
    }
  });
});

describe("proof depends on the change", () => {
  // red-first shows a check failed before; only undoing the work shows the check
  // was about the work. The packet that got here was a test-only diff — an import
  // and two skipif decorators — with every check green and no behaviour verified.
  const profile: Profile = {
    summary: "s", stack: [], commands: {}, structure: [], rules: [], findings: [], adaptations: [],
    toolchain: { runtimes: [] }, dependencies: [], envVars: [], decisions: [], houseRules: [],
    recommendation: { decision: "continue", reason: "r", suggestions: [] },
  };

  const packet = (over: Partial<Packet> = {}): Packet => ({
    id: "P1", module: "M1", title: "greet takes a greeting", objective: "o", context: "",
    files: ["src/greet.js", "src/extra.js", "src/test/greet.test.js"], deps: [],
    verification: ["bun src/test/greet.test.js"], regression: [], risk: "low",
    kind: "change", newDependencies: [], env: [], ...over,
  });

  /** A repo whose greet() takes one argument, and the worktree a packet works in. */
  function fixture() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arrow-depends-"));
    const origin = path.join(dir, "repo");
    const wt = path.join(dir, "work");
    fs.mkdirSync(path.join(origin, "src/test"), { recursive: true });
    fs.writeFileSync(path.join(origin, "src/greet.js"), "module.exports = { greet: (name) => 'hi ' + name };\n");
    execFileSync("git", ["init", "-q", "-b", "main", origin]);
    sh(origin, "add", "-A");
    sh(origin, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init");
    sh(origin, "branch", "arrow/t1");
    sh(origin, "worktree", "add", "-q", "-b", "arrow/t1--p1", wt, "arrow/t1");
    fs.mkdirSync(path.join(wt, "src/test"), { recursive: true }); // git tracks no empty directory
    return { dir, wt, base: "arrow/t1" };
  }

  const verify = (fix: ReturnType<typeof fixture>, p: Packet) =>
    verifyPacket({ wt: fix.wt, base: fix.base, packet: p, profile, house: DEFAULTS, attempt: 1, baseline: {}, env: process.env });

  test("a check that fails with the work undone is verified", async () => {
    const fix = fixture();
    try {
      fs.writeFileSync(path.join(fix.wt, "src/greet.js"), "module.exports = { greet: (name, greeting = 'hi') => greeting + ' ' + name };\n");
      fs.writeFileSync(path.join(fix.wt, "src/test/greet.test.js"), "const { greet } = require('../greet.js');\nif (greet('a', 'yo') !== 'yo a') throw new Error('the greeting was ignored');\n");
      const r = await verify(fix, packet());
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.report.join("\n")).toContain("depend on it");
      // the work is back where the worker left it
      expect(fs.readFileSync(path.join(fix.wt, "src/greet.js"), "utf8")).toContain("greeting = 'hi'");
      expect(sh(fix.wt, "status", "--porcelain")).toBe("");
    } finally {
      fs.rmSync(fix.dir, { recursive: true, force: true });
    }
  });

  test("a check that passes with the production change undone fails the packet", async () => {
    const fix = fixture();
    try {
      // a new file no check runs, plus a test that only exercises the default path
      fs.writeFileSync(path.join(fix.wt, "src/extra.js"), "module.exports = { unused: true };\n");
      fs.writeFileSync(path.join(fix.wt, "src/test/greet.test.js"), "const { greet } = require('../greet.js');\nif (greet('a') !== 'hi a') throw new Error('wrong greeting');\n");
      const r = await verify(fix, packet());
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.failure.class).toBe("verification");
        expect(r.failure.message).toContain("production change undone");
      }
      // including the file the revert deleted: the worker's tree is untouched
      expect(fs.readFileSync(path.join(fix.wt, "src/extra.js"), "utf8")).toContain("unused");
      expect(sh(fix.wt, "status", "--porcelain")).toBe("");
    } finally {
      fs.rmSync(fix.dir, { recursive: true, force: true });
    }
  });

  test("a test-only packet is kept, and the report says it is not verified by behaviour", async () => {
    const fix = fixture();
    try {
      fs.writeFileSync(path.join(fix.wt, "src/test/greet.test.js"), "const { greet } = require('../greet.js');\nif (greet('a') !== 'hi a') throw new Error('wrong greeting');\n");
      const r = await verify(fix, packet({ files: ["src/test/greet.test.js"] }));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.report.join("\n")).toContain("not verified by behaviour");
    } finally {
      fs.rmSync(fix.dir, { recursive: true, force: true });
    }
  });

  test("a refactor is not judged by it — its checks are meant to hold with the work undone", async () => {
    const fix = fixture();
    try {
      fs.writeFileSync(path.join(fix.wt, "src/greet.js"), "module.exports = { greet: (name) => `hi ${name}` };\n");
      fs.writeFileSync(path.join(fix.wt, "src/test/greet.test.js"), "const { greet } = require('../greet.js');\nif (greet('a') !== 'hi a') throw new Error('wrong greeting');\n");
      const r = await verify(fix, packet({ kind: "refactor" }));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.report.join("\n")).toContain("refactor");
    } finally {
      fs.rmSync(fix.dir, { recursive: true, force: true });
    }
  });
});
