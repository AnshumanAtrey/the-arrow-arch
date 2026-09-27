/**
 * The orchestrator's own proof. A worker saying "done" changes nothing: this
 * commits its work, reads what actually changed, applies the house rules, and
 * re-runs the packet's commands itself. The first failing check decides.
 */
import fs from "node:fs";
import path from "node:path";
import { dependencyCheck, diffBudgetCheck, docsCheck, fileSizeCheck, newDependencies, placeholderCheck, secretCheck, type FileFacts } from "./checks";
import { LIMITS } from "./config";
import * as git from "./git";
import { matchesAny } from "./glob";
import type { HouseSettings } from "./house-rules";
import { shell } from "./proc";
import type { Failure, Packet, Profile } from "./types";

export type VerifyResult = { ok: true; report: string[]; changedFiles: string[] } | { ok: false; failure: Failure; changedFiles: string[] };

const looksLikeTest = (f: string) => /(^|\/)(tests?|__tests__|spec)\//.test(f) || /\.(test|spec)\.[a-z]+$/.test(path.basename(f)) || /^test_.*\.py$/.test(path.basename(f));
const MANIFEST = /(^|\/)(package\.json|requirements[^/]*\.txt|pyproject\.toml|go\.mod|Cargo\.toml|bun\.lockb?|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/;

const LOCKFILES: Record<string, string[]> = {
  "package.json": ["package-lock.json", "npm-shrinkwrap.json", "bun.lock", "bun.lockb", "pnpm-lock.yaml", "yarn.lock"],
  "pyproject.toml": ["poetry.lock", "uv.lock"],
  "Cargo.toml": ["Cargo.lock"],
  "go.mod": ["go.sum"],
};
const lockfilesFor = (f: string) => {
  const base = path.basename(f);
  const dir = path.dirname(f) === "." ? "" : `${path.dirname(f)}/`;
  return (LOCKFILES[base] ?? []).map((l) => `${dir}${l}`);
};
const isLockfile = (f: string) => Object.values(LOCKFILES).flat().includes(path.basename(f));

/** The proof commands every packet runs, from the profile, per the house rules. */
export const proofCommands = (profile: Profile, house: HouseSettings) =>
  house.proof.always.map((k) => profile.commands[k]).filter((c): c is string => Boolean(c));

export async function verifyPacket(opts: {
  wt: string;
  base: string; // the task branch; facts are taken from where the packet forked off it
  packet: Packet;
  profile: Profile;
  house: HouseSettings;
  attempt: number;
  baseline: Record<string, number>; // exit codes before any change (from prepare)
  env: NodeJS.ProcessEnv;
  /** files a human already approved despite a protected path (the plan check showed them) */
  approvedProtected?: string[];
}): Promise<VerifyResult> {
  const { wt, base, packet, profile, house } = opts;
  await git.commitAll(wt, `arrow ${packet.id} attempt ${opts.attempt}`);
  const files = await git.changedFiles(wt, base);
  const fail = (failure: Failure): VerifyResult => ({ ok: false, failure, changedFiles: files });
  if (!files.length) return fail({ class: "verification", message: "The worker changed no files." });

  const fork = await git.mergeBase(wt, base);
  const facts = await gatherFacts(wt, fork, files);

  // 1. critical: protected paths and secrets park for a person
  for (const r of profile.rules.filter((r) => r.criticality === "critical" && r.protectedPaths.length)) {
    const hit = files.filter((f) => matchesAny(f, r.protectedPaths) && !matchesAny(f, opts.approvedProtected ?? []));
    if (hit.length) return fail({ class: "protected", message: `Changed ${hit.join(", ")}, which the rule "${r.text}" protects.` });
  }
  const secret = secretCheck(facts);
  if (secret) return fail(secret);

  // 2. the shape of the change. A packet that may change a manifest may change its lockfile too.
  const allowed = [...packet.files, ...packet.files.flatMap(lockfilesFor)];
  const outside = files.filter((f) => !matchesAny(f, allowed));
  if (outside.length) return fail({ class: "scope", message: `Changed files outside this packet's list: ${outside.join(", ")}.` });
  for (const check of [docsCheck(facts, house.docs), fileSizeCheck(facts, house.fileSize)]) if (check) return fail(check);
  // lockfiles and generated files don't count towards what a person has to review
  const numstat = (await git.numstat(wt, fork)).filter((f) => !isLockfile(f.path) && !matchesAny(f.path, house.fileSize.exempt.filter((g) => !g.endsWith(".json"))));
  const budget = diffBudgetCheck(numstat.reduce((n, f) => n + f.added + f.removed, 0), house.diff);
  if (budget) return fail(budget);
  const addedDeps: string[] = [];
  for (const f of files.filter((f) => /package\.json$|requirements[^/]*\.txt$/.test(f)))
    addedDeps.push(...newDependencies(f, await git.showAt(wt, fork, f), readOrEmpty(path.join(wt, f))));
  const deps = dependencyCheck(addedDeps, packet.newDependencies, house.dependencies);
  if (deps) return fail(deps);

  // 3. honesty of the work: tests not weakened, no stubs left behind
  if (!house.tests.mayEditExisting)
    for (const f of files.filter(looksLikeTest)) {
      if (!(await git.existedAt(wt, fork, f))) continue;
      const removed = await git.removedLines(wt, fork, f);
      if (removed.length) return fail({ class: "verification", message: `Weakened an existing test: ${f} lost ${removed.length} line(s).`, report: removed.slice(0, 20) });
    }
  const stub = placeholderCheck(facts, house.placeholders);
  if (stub) return fail(stub);

  // 4. the commands, run by Arrow, in the worker's copy. Exit code decides.
  const report: string[] = [];
  const run = (cmd: string) => shell(cmd, wt, LIMITS.commandTimeoutMs, opts.env);
  const tail = (out: string) => out.trim().split("\n").slice(-25).map((l) => `      ${l}`);
  if (profile.commands.setup && files.some((f) => MANIFEST.test(f))) {
    const r = await run(profile.commands.setup);
    if (r.code !== 0) return fail({ class: "environment", message: `Install failed after the dependency change: ${profile.commands.setup}`, report: tail(r.out) });
    report.push(`PASS  ${profile.commands.setup}  (dependencies changed)`);
  }
  for (const cmd of packet.verification) {
    const r = await run(cmd);
    if (r.code === 0) {
      report.push(`PASS  ${cmd}`);
      continue;
    }
    report.push(`FAIL  ${cmd}  (exit ${r.timedOut ? "timeout" : r.code})`, ...tail(r.out));
    return fail({ class: "verification", message: `A check failed: ${cmd}`, report });
  }
  // the repo's own typecheck / lint: blamed only if they passed before this packet
  for (const cmd of proofCommands(profile, house).filter((c) => !packet.verification.includes(c))) {
    const r = await run(cmd);
    const was = opts.baseline[cmd];
    if (r.code === 0) report.push(`PASS  ${cmd}`);
    else if (was !== undefined && was !== 0) report.push(`NOTE  ${cmd}  (already failing before this packet, not blamed)`);
    else {
      report.push(`FAIL  ${cmd}  (passed before this packet)`, ...tail(r.out));
      return fail({ class: "verification", message: `This packet broke ${cmd}, which passed before it.`, report });
    }
  }
  for (const cmd of packet.regression) {
    const r = await run(cmd);
    const was = opts.baseline[cmd];
    report.push(r.code === 0 ? `PASS  ${cmd}` : `NOTE  ${cmd}  (regression${was !== undefined && was !== 0 ? ", already failing before" : ", newly failing"} — reported, not blocking)`);
  }
  return { ok: true, report, changedFiles: files };
}

async function gatherFacts(wt: string, fork: string, files: string[]): Promise<FileFacts[]> {
  const added = await git.addedFiles(wt, fork);
  const out: FileFacts[] = [];
  for (const f of files) {
    const abs = path.join(wt, f);
    if (!fs.existsSync(abs)) continue; // deleted
    const isNew = added.has(f);
    out.push({
      path: f,
      added: isNew,
      linesNow: lines(readOrEmpty(abs)),
      linesBefore: isNew ? 0 : lines(await git.showAt(wt, fork, f)),
      addedLines: await git.addedLines(wt, fork, f),
    });
  }
  return out;
}

const lines = (s: string) => (s ? s.split("\n").length - (s.endsWith("\n") ? 1 : 0) : 0);
function readOrEmpty(p: string) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
}
