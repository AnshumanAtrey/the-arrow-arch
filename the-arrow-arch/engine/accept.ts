/**
 * Before a task lands: does the finished whole meet the spec? Every packet was
 * proven on its own; this runs the project manager's own "done means" checks on
 * a clean copy of the task branch. A check that is a command is run; a check
 * for a person ("manual: ...") is listed for you, never run.
 */
import fs from "node:fs";
import path from "node:path";
import { run, shell } from "./proc";
import type { Spec } from "./types";

export type Acceptance = { ok: boolean; report: string[]; failures: string[] };

// commands that open windows or wait for a person — never run as an acceptance check
const INTERACTIVE = new Set(["open", "xdg-open", "start", "code", "vim", "vi", "nano", "less", "more", "man"]);

/** Is this check something Arrow can run, or something a person looks at? */
export async function isCommand(check: string): Promise<boolean> {
  const c = check.trim();
  if (!c || /\bmanual\b/i.test(c.split(":")[0]) || /^(manually|by hand|visually)\b/i.test(c)) return false;
  const first = c.split(/\s+/)[0];
  if (!/^[\w./-]+$/.test(first) || INTERACTIVE.has(first)) return false;
  if (first.startsWith("./") || first.includes("/")) return true;
  return (await run("/bin/sh", ["-c", `command -v ${first}`], { timeoutMs: 5000 })).code === 0;
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
  const git = (...a: string[]) => run("git", ["-C", opts.repo, ...a], { timeoutMs: 120_000 });
  await git("worktree", "remove", "--force", opts.dir);
  fs.rmSync(opts.dir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(opts.dir), { recursive: true });
  const add = await git("worktree", "add", "--detach", "--quiet", opts.dir, opts.branch);
  if (add.code !== 0) return { ok: false, report: [add.out.trim()], failures: ["Arrow could not make a clean copy of the task branch."] };

  const report: string[] = [];
  const failures: string[] = [];
  try {
    const install = installFor(opts.dir, opts.setup);
    if (install) {
      const r = await shell(install, opts.dir, 600_000, opts.env);
      report.push(`${r.code === 0 ? "PASS" : "FAIL"}  ${install}  (install)`);
      if (r.code !== 0) failures.push(`Installing the finished task failed: ${install}`);
    }
    for (const a of opts.spec.acceptance) {
      if (!(await isCommand(a.check))) {
        report.push(`YOU   ${a.id} ${a.statement} — check: ${a.check}`);
        continue;
      }
      const r = await shell(a.check, opts.dir, 120_000, opts.env);
      if (r.code === 0) report.push(`PASS  ${a.id} ${a.check}`);
      else {
        report.push(`FAIL  ${a.id} ${a.check}  (exit ${r.timedOut ? "timeout" : r.code})`, ...r.out.trim().split("\n").slice(-12).map((l) => `      ${l}`));
        failures.push(`${a.id} "${a.statement}" — ${a.check} fails`);
      }
    }
  } finally {
    await git("worktree", "remove", "--force", opts.dir);
  }
  return { ok: failures.length === 0, report, failures };
}
