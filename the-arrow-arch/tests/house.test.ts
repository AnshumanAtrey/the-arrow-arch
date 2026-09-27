import { describe, expect, test } from "bun:test";
import { dependencyCheck, diffBudgetCheck, docsCheck, fileSizeCheck, looksLikeTest, newDependencies, placeholderCheck, productionFiles, secretCheck, testDisabledCheck, testWeakenedCheck, assertions, disables, type FileFacts } from "../engine/checks";
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

describe("test integrity (H-TESTS)", () => {
  // the real one: a setup file holds no assertions, so rewriting its import is
  // not weakening anything. Counting removed lines read it as a violation,
  // rejected correct work, and taught the worker to leave dead code behind.
  const setupBefore = "import '@testing-library/jest-dom'\n";
  test("swapping an import in a setup file is not weakening a test", () => {
    expect(testWeakenedCheck("src/test/setup.ts", setupBefore, "import '@testing-library/jest-dom/vitest'\n")).toBeUndefined();
  });
  test("the file filter still covers setup files, so a lost assertion there would be caught", () => {
    expect(looksLikeTest("src/test/setup.ts")).toBe(true);
    expect(looksLikeTest("src/test/a.test.ts")).toBe(true);
    expect(looksLikeTest("test_x.py")).toBe(true);
    expect(looksLikeTest("vitest.config.ts")).toBe(false);
    expect(testWeakenedCheck("src/test/setup.ts", "beforeAll(() => expect(x).toBe(1))\n", "beforeAll(() => {})\n")?.class).toBe("verification");
  });
  test("losing an assertion is caught", () => {
    const before = "it('a', () => {\n  expect(1).toBe(1)\n  expect(2).toBe(2)\n})\n";
    const f = testWeakenedCheck("src/a.test.ts", before, "it('a', () => {\n  expect(1).toBe(1)\n})\n");
    expect(f?.class).toBe("verification");
    expect(f?.message).toContain("down from 2");
  });
  test("commenting an assertion out is not keeping it", () => {
    expect(testWeakenedCheck("src/a.test.ts", "expect(1).toBe(1)\n", "// expect(1).toBe(1)\n")).toBeDefined();
    expect(testWeakenedCheck("src/a.test.ts", "  expect(1).toBe(1)\n", "  expect(1).toBe(1)\n  expect(2).toBe(2)\n")).toBeUndefined(); // adding is always fine
  });
  test("a new test file has nothing to weaken; deleting an existing one is caught", () => {
    expect(testWeakenedCheck("src/a.test.ts", null, "expect(1).toBe(1)\n")).toBeUndefined();
    expect(testWeakenedCheck("src/a.test.ts", "expect(1).toBe(1)\n", null)?.message).toContain("deleted");
  });
  test("assertions are counted in the languages Arrow meets", () => {
    expect(assertions("def test_x():\n    assert x == 1\n")).toBe(1);
    expect(assertions("func TestX(t *testing.T) {\n\tif x != 1 { t.Error(\"no\") }\n}\n")).toBe(1);
    expect(assertions("fn t() { assert_eq!(x, 1); }\n")).toBe(1);
    expect(assertions("expect(a).to.equal(1);\na.should.equal(2);\n")).toBe(2);
    expect(assertions("export const hi = 1;\nimport x from 'y';\n")).toBe(0);
  });

  // the real one: a worker made a Python file pass by hanging a skipif off the
  // two tests that needed DVC data. Assertion count saw nothing — 16 to 16 —
  // and the packet was reported verified while the assertion that mattered had
  // become unreachable.
  const chewsyBefore = "class TestPackagedModel:\n    def test_fresh_process_loads_predicts_and_matches_registry(self):\n        assert MODEL_PATH.exists(), \"missing\"\n    def test_model_is_dvc_tracked_for_fresh_clones(self):\n        assert MODEL_PATH.exists(), \"missing\"\n";
  const chewsyAfter = "import pytest\nclass TestPackagedModel:\n    @pytest.mark.skipif(not MODEL_PATH.exists(), reason=\"DVC data not pulled\")\n    def test_fresh_process_loads_predicts_and_matches_registry(self):\n        assert MODEL_PATH.exists(), \"missing\"\n    @pytest.mark.skipif(not MODEL_PATH.exists(), reason=\"DVC data not pulled\")\n    def test_model_is_dvc_tracked_for_fresh_clones(self):\n        assert MODEL_PATH.exists(), \"missing\"\n";
  test("a new skip that keeps the assertion count level is still caught", () => {
    expect(assertions(chewsyBefore)).toBe(assertions(chewsyAfter)); // the sibling check sees nothing
    expect(disables(chewsyAfter)).toBe(2);
    const d = testDisabledCheck("tests/test_packaged_model.py", chewsyBefore, chewsyAfter);
    expect(d?.class).toBe("protected"); // parks for a person, no retry spent
    expect(d?.message).toContain("tests/test_packaged_model.py");
    expect(d?.message).toContain("2");
    expect(d?.report?.join("\n")).toContain("skipif"); // the report names what was added
  });
  test("adding a test, with no skip, is always fine", () => {
    expect(testDisabledCheck("src/a.test.ts", "expect(1).toBe(1)\n", "expect(1).toBe(1)\n\nit('b', () => {\n  expect(2).toBe(2)\n})\n")).toBeUndefined();
    expect(disables("it('b', () => {\n  expect(2).toBe(2)\n})\n")).toBe(0);
  });
  test("a file this packet created has nothing to switch off", () => {
    expect(testDisabledCheck("tests/test_x.py", null, chewsyAfter)).toBeUndefined();
    expect(testDisabledCheck("tests/test_x.py", chewsyBefore, null)).toBeUndefined(); // deletion is the other check's
  });
  test("commenting a skip out is not adding one", () => {
    expect(disables("# pytest.mark.skipif(not x, reason='why')\n")).toBe(0);
    expect(disables("// it.skip('a', () => {})\n")).toBe(0);
    expect(testDisabledCheck("src/a.test.ts", "// it.skip('a', () => {})\n", "it.skip('a', () => {})\n")?.class).toBe("protected");
    expect(testDisabledCheck("src/a.test.ts", "it.skip('a', () => {})\n", "it.skip('a', () => {})\n\n// it.skip('b', () => {})\n")).toBeUndefined();
  });
  test("focusing one test counts: it stops the rest from running", () => {
    expect(disables("it.only('a', () => {})\n")).toBe(1);
    expect(disables("describe.only('suite', () => {})\n")).toBe(1);
    expect(disables("fdescribe('suite', () => {})\n")).toBe(1);
    expect(testDisabledCheck("src/a.test.ts", "it('a', () => {})\n", "it.only('a', () => {})\n")?.class).toBe("protected");
  });
  test("the markers Arrow meets are counted across languages", () => {
    expect(disables("def test_x():\n    pytest.skip('no data')\n")).toBe(1);
    expect(disables("pytest.importorskip('torch')\n")).toBe(1);
    expect(disables("@pytest.mark.xfail(reason='known')\ndef test_x():\n    assert x\n")).toBe(1);
    expect(disables("func TestX(t *testing.T) {\n\tt.Skip(\"needs network\")\n}\n")).toBe(1);
    expect(disables("#[ignore]\nfn t() { assert_eq!(x, 1); }\n")).toBe(1);
    expect(disables("xit('a', () => {})\nxtest('b', () => {})\n")).toBe(2);
    expect(disables("const x = 'skip the queue';\n")).toBe(0);
    expect(disables("test.skip.each([1, 2])('a', () => {})\n")).toBe(1);
    expect(disables("it.skipIf(process.env.CI)('a', () => {})\n")).toBe(1);
  });

  // found by running the check over its own commit: a test that quotes skip
  // syntax as data read as switching a test off, and `protected` has no escape,
  // so the packet could never land. Assertions rise when string content is added
  // — harmless to the sibling check, which only fails on a drop — so this one has
  // to strip quoted runs before it looks.
  test("a marker inside a string is data, not a skip", () => {
    expect(disables(`expect(disables("it.skip('a', () => {})")).toBe(1);`)).toBe(0);
    expect(disables(`const line = "it.only('a', () => {})";`)).toBe(0);
    expect(disables("const helpers = { skip: 'pytest.mark.skip(reason=\"x\")' };\n")).toBe(0);
    const before = `expect(lint("clean code")).toBe(0);\n`;
    const after = before + `expect(lint("it.only('x', () => {})")).toBe(1);\nexpect(lint("describe.skip('s', () => {})")).toBe(1);\n`;
    expect(assertions(after)).toBeGreaterThan(assertions(before)); // the sibling check raises, and passes
    expect(disables(after)).toBe(0);
    expect(testDisabledCheck("src/lint.test.ts", before, after)).toBeUndefined();
  });
  test("stripping strings keeps every real marker", () => {
    expect(disables("it.skip('a', () => {})\n")).toBe(1);
    expect(disables("@pytest.mark.skipif(not P.exists(), reason=\"no data\")\n")).toBe(1);
    expect(disables("func TestX(t *testing.T) {\n\tt.Skip(\"needs network\")\n}\n")).toBe(1);
    expect(disables("#[ignore = \"slow\"]\n")).toBe(1);
    expect(testDisabledCheck("src/a.test.ts", "it('a', () => {})\n", "it.skip('a', () => {})\n")?.class).toBe("protected");
  });
  test("what a packet changed besides its tests is production", () => {
    expect(productionFiles(["src/greet.js", "src/test/greet.test.js", "tests/b.py", "db/001.sql", "test_x.py"])).toEqual(["src/greet.js", "db/001.sql"]);
    expect(productionFiles(["src/test/a.test.ts"])).toEqual([]); // test-only
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
