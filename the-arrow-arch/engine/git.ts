/**
 * Git, the way Arrow uses it: the clone stays on the base branch; each task
 * gets its own branch; each packet gets its own worktree off that branch; a
 * packet lands by fast-forwarding the task branch. Nothing is ever pushed.
 */
import fs from "node:fs";
import path from "node:path";
import { run } from "./proc";

const git = (cwd: string, ...args: string[]) => run("git", ["-C", cwd, ...args], { timeoutMs: 300_000 });

async function ok(cwd: string, ...args: string[]): Promise<string> {
  const r = await git(cwd, ...args);
  if (r.code !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.out.trim().slice(-800)}`);
  return r.out.trim();
}

const GITHUB = /^(https:\/\/github\.com\/|git@github\.com:)[\w.-]+\/[\w.-]+?(\.git)?\/?$/;

/** Accept a GitHub URL or an absolute path to a local git repo. Anything else is refused. */
export function checkRepoSource(src: string): { ok: true; value: string } | { ok: false; error: string } {
  const v = src.trim();
  if (GITHUB.test(v)) return { ok: true, value: v.replace(/\/$/, "") };
  if (path.isAbsolute(v)) {
    if (fs.existsSync(path.join(v, ".git"))) return { ok: true, value: v };
    return { ok: false, error: "That folder isn't a git repository." };
  }
  return { ok: false, error: "Use a GitHub URL (https://github.com/owner/repo) or an absolute path to a local repo." };
}

export const checkBranch = (b: string) => /^[\w./-]{1,100}$/.test(b) && !b.includes("..") && !b.startsWith("-");

export async function clone(src: string, dest: string, branch?: string) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true }); // a half-finished earlier clone
  const args = ["clone", "--quiet", ...(branch ? ["--branch", branch] : []), "--", src, dest];
  const r = await run("git", args, { timeoutMs: 600_000 });
  if (r.code !== 0) throw new Error(r.out.trim().slice(-800) || "git clone failed");
  // Arrow's own files (agent result files) never belong in a commit — in any worktree
  fs.appendFileSync(path.join(dest, ".git", "info", "exclude"), "\n# arrow\n.arrow/\n");
  return { branch: await ok(dest, "rev-parse", "--abbrev-ref", "HEAD"), head: await ok(dest, "rev-parse", "HEAD") };
}

export const head = (repo: string, ref = "HEAD") => ok(repo, "rev-parse", ref);

export async function ensureBranch(repo: string, name: string, from: string) {
  const exists = (await git(repo, "rev-parse", "--verify", "--quiet", `refs/heads/${name}`)).code === 0;
  if (!exists) await ok(repo, "branch", name, from);
}

/** A packet's private copy. Reused if it exists, so a retry continues from the half-built work. */
export async function worktree(repo: string, dir: string, branch: string, from: string) {
  if (fs.existsSync(path.join(dir, ".git"))) return dir;
  await ensureBranch(repo, branch, from);
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  await ok(repo, "worktree", "add", "--quiet", dir, branch);
  return dir;
}

export async function removeWorktree(repo: string, dir: string, branch: string) {
  await git(repo, "worktree", "remove", "--force", dir);
  await git(repo, "branch", "-D", branch);
}

/** Workers don't commit; the orchestrator does, so nothing outside the job sneaks in. */
export async function commitAll(wt: string, message: string): Promise<boolean> {
  await ok(wt, "add", "-A"); // .arrow/ is in info/exclude, so result files never get staged
  if ((await git(wt, "diff", "--cached", "--quiet")).code === 0) return false;
  await ok(wt, "-c", "user.name=arrow", "-c", "user.email=arrow@localhost", "commit", "--quiet", "--no-verify", "-m", message);
  return true;
}

export async function changedFiles(wt: string, base: string): Promise<string[]> {
  const out = await ok(wt, "diff", "--name-only", `${base}...HEAD`);
  return out.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith(".arrow/"));
}

export async function existedAt(wt: string, ref: string, file: string) {
  return (await git(wt, "cat-file", "-e", `${ref}:${file}`)).code === 0;
}

/** Lines a change removed from a file (ignoring blank ones) — used to catch weakened tests. */
export async function removedLines(wt: string, base: string, file: string): Promise<string[]> {
  const d = await ok(wt, "diff", "--unified=0", `${base}...HEAD`, "--", file);
  return d.split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---") && l.slice(1).trim());
}

export async function rebase(wt: string, onto: string): Promise<{ ok: boolean; out: string }> {
  const r = await git(wt, "-c", "user.name=arrow", "-c", "user.email=arrow@localhost", "rebase", "--quiet", onto);
  if (r.code !== 0) await git(wt, "rebase", "--abort");
  return { ok: r.code === 0, out: r.out };
}

export const isAncestor = async (repo: string, a: string, b: string) =>
  (await git(repo, "merge-base", "--is-ancestor", a, b)).code === 0;

/** Fast-forward a branch that no worktree has checked out. Refuses anything but a fast-forward. */
export async function fastForward(repo: string, branch: string, to: string) {
  const cur = await head(repo, `refs/heads/${branch}`);
  if (!(await isAncestor(repo, cur, to))) throw new Error(`${branch} moved; ${to.slice(0, 7)} is not a fast-forward`);
  await ok(repo, "update-ref", `refs/heads/${branch}`, to, cur);
}
