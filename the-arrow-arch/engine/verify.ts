/**
 * The orchestrator's own proof. A worker saying "done" changes nothing: this
 * commits its work, reads what actually changed, applies the house rules, and
 * re-runs the packet's commands itself. The first failing check decides. Once
 * they all pass it undoes the packet's production change and runs them again —
 * a check that passes with the work undone proves nothing about it.
 */
import fs from "node:fs";
import path from "node:path";
import { dependencyCheck, diffBudgetCheck, docsCheck, fileSizeCheck, looksLikeTest, newDependencies, placeholderCheck, productionFiles, secretCheck, testDisabledCheck, testWeakenedCheck, type FileFacts } from "./checks";
import { LIMITS } from "./config";
import * as git from "./git";
import { matchesAny } from "./glob";
import type { HouseSettings } from "./house-rules";
import { shell } from "./proc";
import type { Failure, Packet, Profile } from "./types";

export type VerifyResult = { ok: true; report: string[]; changedFiles: string[] } | { ok: false; failure: Failure; changedFiles: string[] };

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

/** What a packet's report says when it changed only tests: real work, but no behaviour to prove. */
export const NO_PRODUCTION_NOTE = "no production file changed — tests only, so this packet is not verified by behaviour.";

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
  const tip = await git.head(wt); // the commit holding the worker's work: where this copy must end up
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

  // 3. honesty of the work: tests not weakened or switched off, no stubs left behind
  if (!house.tests.mayEditExisting || house.tests.requireApprovalForNewSkips)
    for (const f of files.filter(looksLikeTest)) {
      if (!(await git.existedAt(wt, fork, f))) continue; // this packet created it
      const abs = path.join(wt, f);
      const after = fs.existsSync(abs) ? readOrEmpty(abs) : null;
      const before = await git.showAt(wt, fork, f);
      const weakened = house.tests.mayEditExisting ? undefined : testWeakenedCheck(f, before, after);
      const disabled = house.tests.requireApprovalForNewSkips ? testDisabledCheck(f, before, after) : undefined;
      // A park is a decision no worker action settles, so it outranks a failure a
      // retry could fix: sending a packet back that has to park anyway only spends
      // the budget. The weakened finding still reaches the person — folded into the
      // report, since only one failure is shown at a time.
      if (disabled) return fail(weakened ? { ...disabled, report: [...(disabled.report ?? []), weakened.message] } : disabled);
      if (weakened) return fail(weakened);
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

  // 5. the other half of red-first. prepare.ts shows a check failed before; that
  // cannot show the check was about *this* work. So put the packet's production
  // files back the way they were at the fork, run its checks again, and put the
  // whole copy back. A check that passes with the work undone was never about the
  // work. What this catches is a packet whose *production* change its checks do
  // not depend on; a packet that changed no production file is out of its reach,
  // and gets the NOTE below. Cost: verifyPacket runs at the verify step and again
  // at the merge step, so each check runs once in prepare and twice at each of
  // those — five, up from three, each inheriting LIMITS.commandTimeoutMs.
  // The undone run happens in the worker's own copy rather than a fresh one: cheap,
  // but what it cannot undo is what git ignores — build output, caches — so a check
  // reading a stale artifact can pass undone and have a correct packet called
  // inert. Run the experiment in a throwaway copy if that ever bites.
  const production = productionFiles(files);
  if (!packet.verification.length)
    // unreachable through prepare.ts, which fails such a packet as bad_check, but
    // an empty list must never read as proof: there was nothing to run.
    return fail({ class: "bad_check", message: "This packet lists no verification commands, so nothing proves the work.", report });
  if (!production.length)
    // a test-only packet is a real thing to be, just not a behavioural proof: it
    // changed no behaviour for a check to be about, and the report says so.
    report.push(`NOTE  ${NO_PRODUCTION_NOTE}`);
  else if (packet.kind === "refactor")
    // a refactor is *meant* to preserve behaviour: its checks should stay green
    // with the work undone, so running the proof here would invert its meaning
    // and reject correct work. Leave refactors out; do not "fix" this.
    report.push("NOTE  refactor — behaviour is meant to stay the same, so its checks are not a behaviour proof.");
  else {
    // an inert production change (a comment, dead code) fails here, and should:
    // its checks are about nothing it did. A packet that means to change nothing
    // is a refactor, and the kind is in the plan a person approved.
    const passing: string[] = [];
    let restore: git.RestoreResult = { ok: true, detail: "" };
    try {
      const undone = await git.restoreFiles(wt, fork, production);
      if (!undone.ok) return fail({ class: "environment", message: `Arrow could not undo the packet's production change to run its checks again: ${undone.detail}.`, report });
      for (const cmd of packet.verification) if ((await run(cmd)).code === 0) passing.push(cmd);
    } finally {
      // never leave the worker's copy in the undone state, whatever ran in it —
      // restoring to the tip the work is committed at puts back everything the
      // checks touched, not only the files this packet changed
      restore = await git.restoreTree(wt, tip, production);
    }
    if (!restore.ok)
      // "environment" because it parks: the copy is not the worker's to fix, and
      // nothing more may run in it until a person has seen it
      return fail({
        class: "environment",
        message: `The checks ran, but Arrow could not put the packet's copy back afterwards: ${restore.detail}. It is left as the undone run left it — a person should look before anything else runs in it.`,
        report: [...report, `FAIL  restoring the packet's copy  (${restore.detail})`],
      });
    if (passing.length === packet.verification.length)
      return fail({
        class: "verification",
        message: "Every check passes with this packet's production change undone, so none of them prove it. Aim a check at what the change does, or plan the packet as a refactor if behaviour is meant to stay the same.",
        report: [...report, `FAIL  ${passing.join(", ")}  (passes with the production change undone)`],
      });
    report.push("PASS  the checks fail with the production change undone, so they depend on it");
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
