/**
 * A stand-in for every role that calls no model. It reads the real repo and the
 * real rules, applies simple heuristics, and writes the same result files a real
 * agent would — so the whole flow (gates, parallel workers, verification, merge)
 * can be watched end to end. Its judgments are heuristics, and the UI says so.
 */
import fs from "node:fs";
import path from "node:path";
import { LIMITS } from "../config";
import type { ArchitectInput, CompleteInput, OnboarderInput, PmInput, RepairInput, ReportInput, WorkerInput } from "../roles";
import type { HouseOutcome } from "../house-rules";
import type { Packet, Plan, Profile, Rule, RuleFinding, Spec } from "../types";
import type { Driver } from "./driver";

const SENSITIVE = /secret|credential|password|token|auth|permission|migration|schema|production|prod\b|deploy|delete|drop|pii|payment|billing|licen[cs]e/i;

export const mock: Driver = async (r) => {
  // the same log layout as a real engine, so the prompt it was given can be read back
  fs.mkdirSync(path.dirname(r.logFile), { recursive: true });
  fs.appendFileSync(r.logFile, `$ mock ${r.role}\n\n----- prompt -----\n${r.prompt}\n----- output -----\n`);
  await new Promise((res) => setTimeout(res, LIMITS.mockDelayMs));
  const input = r.input as Record<string, unknown>;
  let out: unknown;
  switch (r.role) {
    case "onboarder":
      out = onboard(input as unknown as OnboarderInput);
      break;
    case "pm":
      out = "acceptance" in input ? report(r.cwd, input as unknown as ReportInput) : pm(input as unknown as PmInput);
      break;
    case "architect":
      out = "failures" in input ? complete(input as unknown as CompleteInput) : "failure" in input ? repair(input as unknown as RepairInput) : architect(input as unknown as ArchitectInput);
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
  const toolchain: Profile["toolchain"] = { runtimes: [] };
  const dependencies: Profile["dependencies"] = [];
  if (has("package.json")) {
    const pkg = safeJson(path.join(repoPath, "package.json"));
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) } as Record<string, string>;
    stack.push(has("tsconfig.json") ? "TypeScript" : "JavaScript");
    for (const [k, label] of [["next", "Next.js"], ["react", "React"], ["express", "Express"], ["hono", "Hono"], ["vue", "Vue"], ["svelte", "Svelte"], ["prisma", "Prisma"], ["drizzle-orm", "Drizzle"]] as const)
      if (deps[k]) stack.push(label);
    const pm = has("bun.lock") || has("bun.lockb") ? "bun" : has("pnpm-lock.yaml") ? "pnpm" : has("yarn.lock") ? "yarn" : "npm";
    const scripts = (pkg.scripts ?? {}) as Record<string, string>;
    for (const k of ["build", "test", "typecheck", "lint"] as const) if (scripts[k]) commands[k] = `${pm} run ${k}`;
    const lockfile = ["bun.lock", "bun.lockb", "pnpm-lock.yaml", "yarn.lock", "package-lock.json"].find(has);
    // a plain install into the worktree's own node_modules — no Docker
    if (Object.keys(deps).length)
      commands.setup = { bun: "bun install", pnpm: "pnpm install --frozen-lockfile", yarn: "yarn install --frozen-lockfile", npm: lockfile ? "npm ci" : "npm install" }[pm];
    Object.assign(toolchain, { packageManager: pm, lockfile });
    const node = readFirst(repoPath, [".nvmrc", ".node-version"]) ?? pkg.engines?.node;
    if (node) toolchain.runtimes.push({ name: "node", version: String(node).replace(/^v/, ""), source: ".nvmrc / engines" });
    for (const [name, version] of Object.entries(deps).slice(0, 25)) dependencies.push({ name, version: String(version).replace(/^[\^~]/, "") });
  }
  if (has("pyproject.toml") || has("requirements.txt")) {
    stack.push("Python");
    // a venv per worktree: the system pip refuses installs (PEP 668, "externally-managed-environment")
    if (has("requirements.txt")) commands.setup ??= "python3 -m venv .venv && .venv/bin/pip install -q -r requirements.txt";
    const py = readFirst(repoPath, [".python-version"]);
    if (py) toolchain.runtimes.push({ name: "python3", version: py, source: ".python-version" });
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
    toolchain,
    dependencies,
    envVars: envNames(repoPath),
    decisions: adrs(repoPath),
    houseRules: houseOutcomes(repoPath, rulesText),
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
      // "#gap" in a task: an acceptance check no packet covers — exercises the completion pass
      ...(/#gap/.test(task) ? [{ id: "A3", statement: "The gap is closed.", check: "test -s arrow-demo/t1/gap.ts" }] : []),
    ],
    outOfScope: ["Pushing or deploying — Arrow only prepares a branch."],
    risk: risky ? "high" : "low",
    questions: or
      ? [{ id: "Q1", question: `You wrote "${or[0]}". Should we build ${or[1].trim()} or ${or[2].trim()}?`, options: [or[1].trim(), or[2].trim(), "Both"] }]
      : [],
    rulesTouched: profile.rules.filter((r) => r.protectedPaths.some((p) => task.includes(p.split("*")[0]))).map((r) => r.id),
  };
}

function architect({ taskId, spec, profile, phase }: ArchitectInput): Plan {
  const dir = `arrow-demo/${taskId.toLowerCase()}`;
  if (phase) {
    const f = `${dir}/phase-${phase.number}.ts`;
    return {
      summary: `Phase ${phase.number}: ${phase.ahead[0]}. (Mock architect.)`,
      modules: [],
      packets: [{ id: `PH${phase.number}`, module: "M1", title: phase.ahead[0], objective: phase.ahead[0], context: spec.intent, files: [f], deps: [], verification: [`test -s ${f}`], regression: [], risk: "low", kind: "change", newDependencies: [], env: [] }],
      rulesImpact: [],
      advice: { decision: "continue", reason: "Builds on what landed in the earlier phase.", suggestions: [] },
      nextPhases: phase.ahead.slice(1),
      acceptanceAdds: [],
    };
  }
  const guarded = profile.rules.find((r) => r.criticality === "critical" && r.protectedPaths.length && spec.rulesTouched.includes(r.id));
  const mk = (id: string, title: string, files: string[], deps: string[] = []): Packet => ({
    id, module: "M1", title, objective: `${title} — for: ${spec.title}`, context: spec.intent, files, deps,
    verification: files.map((f) => `test -s ${f}`), regression: profile.commands.test ? [profile.commands.test] : [], risk: guarded ? "high" : "low",
    kind: "change", newDependencies: [], env: [],
  });
  const packets = [
    mk("P1", "Write the first half", [`${dir}/part-1.ts`]),
    mk("P2", "Write the second half", [guarded ? `${guarded.protectedPaths[0].split("*")[0].replace(/\/$/, "")}/arrow-note.sql` : `${dir}/part-2.ts`]),
  ];
  packets.push(mk("P3", "Tie both halves together", [`${dir}/index.ts`], ["P1", "P2"]));
  return {
    summary: `Three packets: two independent ones run side by side, then one that depends on both. (Mock architect.)`,
    modules: [{ id: "M1", title: spec.title, context: spec.intent }],
    packets,
    rulesImpact: guarded ? [{ ruleId: guarded.id, impact: `P2 writes inside ${guarded.protectedPaths[0]}, which this rule protects.`, conflict: true }] : [],
    advice: guarded
      ? { decision: "stop", reason: `The task reaches into a protected area (${guarded.protectedPaths[0]}).`, suggestions: ["Confirm this change is intended, or reword the task to stay outside the protected path."] }
      : { decision: "continue", reason: "Every packet stays inside allowed paths.", suggestions: [] },
    nextPhases: spec.methodology.mode === "one_shot" ? [] : ["Finish what the first phase started"],
    acceptanceAdds: [],
  };
}

/**
 * The review: every criterion met and every rule kept — unless the task asks for a
 * gap only a review would see ("#pmgap": a criterion; "#rulegap": a company rule)
 * and no completion packet has closed it yet.
 */
function report(cwd: string, { task, spec, packets, profile }: ReportInput) {
  const open = !packets.some((p) => p.id === "PG1");
  const gap = task.includes("#pmgap") && open;
  const ruleGap = task.includes("#rulegap") && open;
  return {
    summary: `${spec.title}. (Mock project manager.)`,
    view: fs.existsSync(path.join(cwd, "index.html")) ? { how: "page", entry: "index.html", command: "" } : { how: "none", entry: "", command: "" },
    criteria: spec.acceptance.map((c, i) => ({ id: c.id, verdict: gap && i === 0 ? "not_met" : "met", evidence: gap && i === 0 ? "No packet handles this yet." : `Checked by ${c.check}.` })),
    rules: profile.rules.map((r, i) => ({ ruleId: r.id, verdict: ruleGap && i === 0 ? "broken" : "kept", evidence: ruleGap && i === 0 ? "The work does not follow this rule yet." : "Checked against the finished files." })),
    ran: "",
    forYou: [],
    notes: [],
  };
}

function repair({ packet, failure }: RepairInput) {
  return { packet: { ...packet, context: `${packet.context}\n\nRe-aimed after: ${failure.message}`.trim() }, followUps: [] };
}

/** One packet that adds a file per failing acceptance check. */
function complete({ taskId, failures }: CompleteInput) {
  const f = `arrow-demo/${taskId.toLowerCase()}/gap.ts`;
  return {
    packets: [{ id: "PG1", module: "M1", title: "Close the gap to the spec", objective: failures.join("; ") || "close the gap", context: "", files: [f], deps: [], verification: [`test -s ${f}`], regression: [], risk: "low", kind: "change", newDependencies: [], env: [] }],
    note: "Mock completion pass.",
  };
}

function work(cwd: string, { packet, attempt }: WorkerInput) {
  for (const f of packet.files) {
    if (/[*?]/.test(f)) continue;
    const abs = path.join(cwd, f);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const body = f.endsWith(".sql")
      ? `-- ${packet.title}: ${packet.objective} (mock worker, ${packet.id}, attempt ${attempt})\n`
      : `// ${packet.title} (mock worker, ${packet.id}, attempt ${attempt})\nexport const ${packet.id.toLowerCase()} = ${JSON.stringify(packet.objective)};\n`;
    fs.existsSync(abs) ? fs.appendFileSync(abs, `\n${body}`) : fs.writeFileSync(abs, body);
  }
  return { status: "implemented", summary: `Wrote ${packet.files.length} file(s).`, newFacts: [] };
}

/** Env var NAMES the repo expects (from its example env files) — values are never read. */
function envNames(repo: string): Profile["envVars"] {
  const out: Profile["envVars"] = [];
  for (const f of [".env.example", ".env.sample", ".env.template"]) {
    const txt = readFirst(repo, [f], true);
    if (!txt) continue;
    for (const line of txt.split("\n")) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      if (m && !out.some((v) => v.name === m[1])) out.push({ name: m[1], source: f });
    }
  }
  return out;
}

/** Decision records the company already keeps (docs/adr, docs/decisions) become Arrow decisions. */
function adrs(repo: string): Profile["decisions"] {
  for (const d of ["docs/adr", "docs/decisions", "adr"]) {
    const dir = path.join(repo, d);
    if (!fs.existsSync(dir)) continue;
    return fs.readdirSync(dir).filter((f) => f.endsWith(".md")).slice(0, 30).map((f) => {
      const title = fs.readFileSync(path.join(dir, f), "utf8").split("\n").find((l) => l.startsWith("#"))?.replace(/^#+\s*/, "") ?? f;
      return { text: title, why: "", source: `${d}/${f}` };
    });
  }
  return [];
}

/** The mock's reading of the company's rules against Arrow's house rules. Heuristics, clearly. */
function houseOutcomes(repo: string, rules: string): HouseOutcome[] {
  const out: HouseOutcome[] = [];
  const lines = rules.match(/(\d{3,4})\s*lines/i);
  if (lines) out.push({ id: "H-FILESIZE", outcome: "replace", why: `Company rule: files up to ${lines[1]} lines.`, settings: { maxLines: Number(lines[1]) } });
  else {
    const big = countBigFiles(repo, 500);
    if (big) out.push({ id: "H-FILESIZE", outcome: "dont_grow", why: `${big} file(s) are already over 500 lines; they may stay, but not grow.` });
  }
  const docs = rules.match(/\b(docs\/[\w\/-]+)/i);
  if (docs && /doc|adr|design/i.test(rules)) out.push({ id: "H-DOCS", outcome: "replace", why: `Company keeps docs in ${docs[1]}.`, settings: { allowPaths: [`${docs[1].replace(/\/$/, "")}/**`] } });
  if (/\b(update|change|edit|rewrite)\b[^.\n]*\btests?\b[^.\n]*\b(freely|allowed|may|can)\b/i.test(rules))
    out.push({ id: "H-TESTS", outcome: "conflict", why: "Company rules let tests be changed freely.", settings: { mayEditExisting: true } });
  const port = rules.match(/\bports?\s+(\d{4,5})/i);
  if (port) out.push({ id: "H-PORTS", outcome: "replace", why: `Company dev ports start at ${port[1]}.`, settings: { base: Number(port[1]) } });
  return out;
}

function countBigFiles(repo: string, max: number): number {
  let n = 0;
  const walk = (dir: string, depth: number) => {
    if (depth > 6) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (/\.(ts|tsx|js|jsx|py|go|rs|java|kt|rb|php|cs|swift)$/.test(e.name) && fs.readFileSync(p, "utf8").split("\n").length > max) n++;
    }
  };
  walk(repo, 0);
  return n;
}

function readFirst(repo: string, names: string[], raw = false): string | undefined {
  for (const n of names) {
    const p = path.join(repo, n);
    if (fs.existsSync(p)) return raw ? fs.readFileSync(p, "utf8") : fs.readFileSync(p, "utf8").trim();
  }
  return undefined;
}

function safeJson(file: string): Record<string, any> {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}
