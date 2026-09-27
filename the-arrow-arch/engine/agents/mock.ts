/**
 * A stand-in for every role that calls no model. It reads the real repo and the
 * real rules, applies simple heuristics, and writes the same result files a real
 * agent would — so the whole flow (gates, parallel workers, verification, merge)
 * can be watched end to end. Its judgments are heuristics, and the UI says so.
 */
import fs from "node:fs";
import path from "node:path";
import { LIMITS } from "../config";
import type { ArchitectInput, OnboarderInput, PmInput, RepairInput, WorkerInput } from "../roles";
import type { Packet, Plan, Profile, Rule, RuleFinding, Spec } from "../types";
import type { Driver } from "./driver";

const SENSITIVE = /secret|credential|password|token|auth|permission|migration|schema|production|prod\b|deploy|delete|drop|pii|payment|billing|licen[cs]e/i;

export const mock: Driver = async (r) => {
  await new Promise((res) => setTimeout(res, LIMITS.mockDelayMs));
  const input = r.input as Record<string, unknown>;
  let out: unknown;
  switch (r.role) {
    case "onboarder":
      out = onboard(input as unknown as OnboarderInput);
      break;
    case "pm":
      out = pm(input as unknown as PmInput);
      break;
    case "architect":
      out = "failure" in input ? repair(input as unknown as RepairInput) : architect(input as unknown as ArchitectInput);
      break;
    case "worker":
      out = work(r.cwd, input as unknown as WorkerInput);
      break;
    default:
      return { exitCode: 1, timedOut: false, tail: `mock has no role ${r.role}` };
  }
  fs.mkdirSync(path.dirname(r.outFile), { recursive: true });
  fs.writeFileSync(r.outFile, JSON.stringify(out, null, 2));
  fs.appendFileSync(r.logFile, `[mock ${r.role}] wrote ${r.outFile}\n`);
  return { exitCode: 0, timedOut: false, tail: "" };
};

// ------------------------------------------------------------------ onboarder

function onboard({ repoPath, rulesText }: OnboarderInput): Profile {
  const has = (p: string) => fs.existsSync(path.join(repoPath, p));
  const stack: string[] = [];
  const commands: Profile["commands"] = {};
  if (has("package.json")) {
    const pkg = safeJson(path.join(repoPath, "package.json"));
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) } as Record<string, string>;
    stack.push(has("tsconfig.json") ? "TypeScript" : "JavaScript");
    for (const [k, label] of [["next", "Next.js"], ["react", "React"], ["express", "Express"], ["hono", "Hono"], ["vue", "Vue"], ["svelte", "Svelte"], ["prisma", "Prisma"], ["drizzle-orm", "Drizzle"]] as const)
      if (deps[k]) stack.push(label);
    const pm = has("bun.lock") || has("bun.lockb") ? "bun" : has("pnpm-lock.yaml") ? "pnpm" : has("yarn.lock") ? "yarn" : "npm";
    const scripts = (pkg.scripts ?? {}) as Record<string, string>;
    for (const k of ["build", "test", "typecheck", "lint"] as const) if (scripts[k]) commands[k] = `${pm} run ${k}`;
  }
  if (has("pyproject.toml") || has("requirements.txt")) {
    stack.push("Python");
    if (has("tests") || has("pytest.ini")) commands.test ??= "python -m pytest -q";
  }
  if (has("go.mod")) (stack.push("Go"), (commands.test ??= "go test ./..."));
  if (has("Cargo.toml")) (stack.push("Rust"), (commands.test ??= "cargo test"));

  const purpose: Record<string, string> = {
    src: "source code", app: "application routes and pages", lib: "shared library code", components: "UI components",
    tests: "tests", test: "tests", docs: "documentation", scripts: "scripts and tooling", db: "database", migrations: "database migrations",
    public: "static assets", packages: "workspace packages", apps: "deployable apps", api: "API code", config: "configuration",
  };
  const structure = fs
    .readdirSync(repoPath, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith(".") && d.name !== "node_modules")
    .slice(0, 14)
    .map((d) => ({ path: `${d.name}/`, purpose: purpose[d.name] ?? "project files" }));

  const rules = parseRules(rulesText);
  const findings: RuleFinding[] = rules.map((r) => check(r, repoPath, commands));
  const bad = findings.filter((f) => f.status !== "ok" && rules.find((r) => r.id === f.ruleId)?.criticality === "critical");

  return {
    summary: `A ${stack.join(" + ") || "code"} repository with ${structure.length} top-level folders. (Mock onboarder: heuristics, not a model.)`,
    stack,
    commands,
    structure,
    rules,
    findings,
    adaptations: [
      { setting: "proof command", value: commands.test ?? "none found", why: "Workers are judged by this, re-run by Arrow itself." },
      { setting: "parallel workers", value: String(LIMITS.parallelWorkers), why: "Only packets that touch different files run together." },
      { setting: "branches", value: "arrow/<task>, one worktree per packet", why: "Nothing lands on your branch; nothing is pushed." },
      { setting: "protected paths", value: String(rules.flatMap((r) => (r.criticality === "critical" ? r.protectedPaths : [])).length), why: "Critical rules become paths no packet may touch without you." },
    ],
    recommendation: bad.length
      ? {
          decision: "stop",
          reason: `${bad.length} critical rule(s) aren't met by the repo as it stands. Building on top would carry the problem forward.`,
          suggestions: bad.map((f) => f.suggestion).filter(Boolean),
        }
      : { decision: "continue", reason: "Nothing critical is at stake. The repo and the rules fit together.", suggestions: [] },
  };
}

function parseRules(text: string): Rule[] {
  const lines = text
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter((l) => l.length > 3 && !l.startsWith("#"));
  return lines.slice(0, 40).map((t, i) => {
    const paths = [...t.matchAll(/`([^`\s]+)`/g), ...t.matchAll(/(?:^|\s)((?:[\w.-]+\/)+[\w.*-]*)/g)].map((m) => m[1].replace(/[.,;:]$/, ""));
    const category: Rule["category"] = /test/i.test(t) ? "testing" : /folder|director|structure|file/i.test(t) ? "structure" : /name|case/i.test(t) ? "naming" : SENSITIVE.test(t) ? "security" : /review|commit|branch|pr\b/i.test(t) ? "process" : "code";
    return { id: `R${i + 1}`, text: t, source: "company rules", category, criticality: SENSITIVE.test(t) ? "critical" : "normal", protectedPaths: [...new Set(paths)] };
  });
}

function check(r: Rule, repo: string, commands: Profile["commands"]): RuleFinding {
  const firstDir = r.protectedPaths.map((p) => p.split(/[*?]/)[0].replace(/\/$/, "")).find(Boolean);
  if (firstDir && !fs.existsSync(path.join(repo, firstDir)) && /\b(in|under|inside|live|goes?)\b/i.test(r.text))
    return { ruleId: r.id, status: "violated", evidence: `${firstDir}/ does not exist in the repo.`, suggestion: `Create ${firstDir}/ or correct the rule before building on it.` };
  if (r.category === "testing" && !commands.test)
    return { ruleId: r.id, status: "unclear", evidence: "No test command was found, so this rule can't be proven on each change.", suggestion: "Add a test script, or tell Arrow which command proves a change." };
  if (firstDir)
    return { ruleId: r.id, status: "ok", evidence: `${firstDir}/ exists; changes to it will need your approval.`, suggestion: "" };
  return { ruleId: r.id, status: "ok", evidence: "Nothing in the repo contradicts this.", suggestion: "" };
}

// ------------------------------------------------------------------ pm / architect / worker

function pm({ task, profile }: PmInput): Spec {
  const first = task.split(/(?<=[.!?])\s/)[0].trim();
  const or = task.match(/\b([\w ]{3,40}?) or ([\w ]{3,40})\b/i);
  const risky = SENSITIVE.test(task);
  return {
    title: first.length > 70 ? `${first.slice(0, 67)}…` : first,
    intent: task.trim(),
    methodology: task.split(/\s+/).length > 60
      ? { mode: "phased", why: "Several separate outcomes — land and prove each before the next builds on it." }
      : { mode: "one_shot", why: "One clear outcome — plan once, build in parallel, prove, land." },
    acceptance: [
      { id: "A1", statement: "The change described in the task is in place.", check: "each packet's verification commands pass, re-run by Arrow" },
      ...(profile.commands.test ? [{ id: "A2", statement: "Everything that passed before still passes.", check: profile.commands.test }] : []),
    ],
    outOfScope: ["Pushing or deploying — Arrow only prepares a branch."],
    risk: risky ? "high" : "low",
    questions: or
      ? [{ id: "Q1", question: `You wrote "${or[0]}". Should we build ${or[1].trim()} or ${or[2].trim()}?`, options: [or[1].trim(), or[2].trim(), "Both"] }]
      : [],
    rulesTouched: profile.rules.filter((r) => r.protectedPaths.some((p) => task.includes(p.split("*")[0]))).map((r) => r.id),
  };
}

function architect({ taskId, spec, profile }: ArchitectInput): Plan {
  const dir = `arrow-demo/${taskId.toLowerCase()}`;
  const guarded = profile.rules.find((r) => r.criticality === "critical" && r.protectedPaths.length && spec.rulesTouched.includes(r.id));
  const mk = (id: string, title: string, files: string[], deps: string[] = []): Packet => ({
    id, module: "M1", title, objective: `${title} — for: ${spec.title}`, context: spec.intent, files, deps,
    verification: files.map((f) => `test -s ${f}`), regression: profile.commands.test ? [profile.commands.test] : [], risk: guarded ? "high" : "low",
  });
  const packets = [
    mk("P1", "Write the first half", [`${dir}/part-1.md`]),
    mk("P2", "Write the second half", [guarded ? `${guarded.protectedPaths[0].split("*")[0].replace(/\/$/, "")}/arrow-note.md` : `${dir}/part-2.md`]),
  ];
  packets.push(mk("P3", "Tie both halves together", [`${dir}/README.md`], ["P1", "P2"]));
  return {
    summary: `Three packets: two independent ones run side by side, then one that depends on both. (Mock architect.)`,
    modules: [{ id: "M1", title: spec.title, context: spec.intent }],
    packets,
    rulesImpact: guarded ? [{ ruleId: guarded.id, impact: `P2 writes inside ${guarded.protectedPaths[0]}, which this rule protects.` }] : [],
    advice: guarded
      ? { decision: "stop", reason: `The task reaches into a protected area (${guarded.protectedPaths[0]}).`, suggestions: ["Confirm this change is intended, or reword the task to stay outside the protected path."] }
      : { decision: "continue", reason: "Every packet stays inside allowed paths.", suggestions: [] },
  };
}

function repair({ packet, failure }: RepairInput): Packet {
  return { ...packet, context: `${packet.context}\n\nRe-aimed after: ${failure.message}`.trim() };
}

function work(cwd: string, { packet, attempt }: WorkerInput) {
  for (const f of packet.files) {
    if (/[*?]/.test(f)) continue;
    const abs = path.join(cwd, f);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const body = `# ${packet.title}\n\n${packet.objective}\n\nWritten by the mock worker for ${packet.id} (attempt ${attempt}).\n`;
    fs.existsSync(abs) ? fs.appendFileSync(abs, `\n${body}`) : fs.writeFileSync(abs, body);
  }
  return { status: "implemented", summary: `Wrote ${packet.files.length} file(s).`, newFacts: [] };
}

function safeJson(file: string): Record<string, any> {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}
