/**
 * Before a task lands: does the finished whole meet the spec? Every packet was
 * proven on its own; this runs the project manager's own "done means" checks on
 * a clean copy of the task branch. A check that is a command is run; a check
 * for a person ("manual: ...") is listed for you, never run.
 */
import fs from "node:fs";
import path from "node:path";
import { withSnapshot } from "./git";
import { run, shell } from "./proc";
import type { Spec } from "./types";

export type Acceptance = { ok: boolean; report: string[]; failures: string[] };

// commands that open windows or wait for a person — never run as an acceptance check
const INTERACTIVE = new Set(["open", "xdg-open", "start", "code", "vim", "vi", "nano", "less", "more", "man"]);

/**
 * Is this check something Arrow can run, or something a person looks at? Only an
 * unmistakable command is run: its first word is a real executable, spelled
 * exactly (macOS finds "Open" as `open`, which would launch a browser), in
 * lowercase, or an explicit ./path — never prose, never a GUI command.
 */
export async function isCommand(check: string): Promise<boolean> {
  const c = check.trim();
  if (!c || /\bmanual\b/i.test(c.split(":")[0]) || /^(manually|by hand|visually)\b/i.test(c)) return false;
  const first = c.split(/\s+/)[0];
  if (!/^[\w./-]+$/.test(first) || INTERACTIVE.has(first.toLowerCase()) || /^[A-Z]/.test(first)) return false;
  if (first.startsWith("./") || first.startsWith("/")) return true;
  if (first.includes("/")) return false; // "Tab/arrow/enter" is prose, not a path
  const found = (await run("/bin/sh", ["-c", `command -v ${first}`], { timeoutMs: 5000 })).out.trim();
  if (found === first) return true; // a shell builtin (test, [, echo), spelled exactly
  if (!found.startsWith("/")) return false;
  // exact spelling: the directory must hold a file with exactly this name
  try {
    return fs.readdirSync(path.dirname(found)).includes(first);
  } catch {
    return false;
  }
}

/** How to install what the finished task declares — plain installs, no Docker. */
function installFor(dir: string, setup?: string): string | undefined {
  if (setup) return setup;
  const has = (f: string) => fs.existsSync(path.join(dir, f));
  if (has("bun.lock") || has("bun.lockb")) return "bun install";
  if (has("pnpm-lock.yaml")) return "pnpm install --frozen-lockfile";
  if (has("yarn.lock")) return "yarn install --frozen-lockfile";
  if (has("package-lock.json")) return "npm ci";
  if (has("package.json")) return "npm install";
  if (has("requirements.txt")) return "python3 -m venv .venv && .venv/bin/pip install -q -r requirements.txt";
  return undefined;
}

export async function acceptTask(opts: { repo: string; branch: string; dir: string; spec: Spec; setup?: string; env: NodeJS.ProcessEnv }): Promise<Acceptance> {
  return withSnapshot(opts.repo, opts.dir, opts.branch, (dir) => checkAll(dir, opts));
}

async function checkAll(dir: string, opts: { spec: Spec; setup?: string; env: NodeJS.ProcessEnv }): Promise<Acceptance> {
  const report: string[] = [];
  const failures: string[] = [];
  const install = installFor(dir, opts.setup);
  if (install) {
    const r = await shell(install, dir, 600_000, opts.env);
    report.push(`${r.code === 0 ? "PASS" : "FAIL"}  ${install}  (install)`);
    if (r.code !== 0) failures.push(`Installing the finished task failed: ${install}`);
  }
  for (const a of opts.spec.acceptance) {
    if (!(await isCommand(a.check))) {
      report.push(`YOU   ${a.id} ${a.statement} — check: ${a.check}`);
      continue;
    }
    const r = await shell(a.check, dir, 120_000, opts.env);
    if (r.code === 0) report.push(`PASS  ${a.id} ${a.check}`);
    else {
      report.push(`FAIL  ${a.id} ${a.check}  (exit ${r.timedOut ? "timeout" : r.code})`, ...r.out.trim().split("\n").slice(-12).map((l) => `      ${l}`));
      failures.push(`${a.id} "${a.statement}" — ${a.check} fails`);
    }
  }
  return { ok: failures.length === 0, report, failures };
}
