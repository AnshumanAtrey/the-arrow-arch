/**
 * The orchestrator's own proof. A worker saying "done" changes nothing: this
 * re-runs the packet's commands itself and checks what actually changed.
 */
import path from "node:path";
import { LIMITS } from "./config";
import { changedFiles, commitAll, existedAt, removedLines } from "./git";
import { matchesAny } from "./glob";
import { shell } from "./proc";
import type { Failure, Packet, Profile } from "./types";

export type VerifyResult = { ok: true; report: string[]; changedFiles: string[] } | { ok: false; failure: Failure; changedFiles: string[] };

const looksLikeTest = (f: string) => /(^|\/)(tests?|__tests__|spec)\//.test(f) || /\.(test|spec)\.[a-z]+$/.test(path.basename(f)) || /^test_.*\.py$/.test(path.basename(f));

export async function verifyPacket(opts: {
  wt: string;
  base: string; // the task branch; diffs are taken from where the packet forked off it
  packet: Packet;
  profile: Profile;
  attempt: number;
  /** scope entries a human already approved despite a protected path (the plan check showed them) */
  approvedProtected?: string[];
}): Promise<VerifyResult> {
  const { wt, base, packet, profile } = opts;
  await commitAll(wt, `arrow ${packet.id} attempt ${opts.attempt}`);
  const files = await changedFiles(wt, base);
  const fail = (cls: Failure["class"], message: string, report: string[] = []): VerifyResult => ({
    ok: false,
    failure: { class: cls, message, report },
    changedFiles: files,
  });

  if (!files.length) return fail("verification", "The worker changed no files.");

  // 1. critical company rules: protected paths are never touched without a human
  for (const r of profile.rules.filter((r) => r.criticality === "critical" && r.protectedPaths.length)) {
    const hit = files.filter((f) => matchesAny(f, r.protectedPaths) && !matchesAny(f, opts.approvedProtected ?? []));
    if (hit.length) return fail("protected", `Changed ${hit.join(", ")}, which the rule "${r.text}" protects.`);
  }

  // 2. scope: only the files the packet allows
  const outside = files.filter((f) => !matchesAny(f, packet.files));
  if (outside.length) return fail("scope", `Changed files outside this packet's list: ${outside.join(", ")}.`);

  // 3. an existing test may gain cases; it may not lose assertions
  for (const f of files.filter(looksLikeTest)) {
    if (!(await existedAt(wt, base, f))) continue;
    const removed = await removedLines(wt, base, f);
    if (removed.length) return fail("verification", `Weakened an existing test: ${f} lost ${removed.length} line(s).`, removed.slice(0, 20));
  }

  // 4. the commands, run by us, in the worker's copy. Exit code decides.
  const report: string[] = [];
  const steps = [...(profile.commands.setup ? [{ cmd: profile.commands.setup, kind: "setup" }] : []), ...packet.verification.map((cmd) => ({ cmd, kind: "check" }))];
  for (const { cmd, kind } of steps) {
    const r = await shell(cmd, wt, LIMITS.commandTimeoutMs);
    if (r.code === 0) {
      report.push(`PASS  ${cmd}`);
      continue;
    }
    report.push(`FAIL  ${cmd}  (exit ${r.timedOut ? "timeout" : r.code})`, ...r.out.trim().split("\n").slice(-25).map((l) => `      ${l}`));
    return fail("verification", kind === "setup" ? `Setup failed: ${cmd}` : `A check failed: ${cmd}`, report);
  }
  // broader suites are reported, never blamed: they may have been red before this packet
  for (const cmd of packet.regression) {
    const r = await shell(cmd, wt, LIMITS.commandTimeoutMs);
    report.push(`${r.code === 0 ? "PASS" : "NOTE"}  ${cmd}${r.code === 0 ? "" : "  (regression, not blocking)"}`);
  }
  return { ok: true, report, changedFiles: files };
}
