/**
 * Before a worker starts: its own worktree, a plain dependency install (no
 * Docker — node_modules in the worktree is the isolation), and two measurements
 * on the untouched code:
 *   red-first  the packet's checks must fail before the change, or they prove nothing
 *   baseline   what the repo's typecheck / lint / regression already do, so a
 *              failure that was there before is never blamed on the worker
 */
import { LIMITS } from "./config";
import * as git from "./git";
import type { HouseSettings } from "./house-rules";
import { shell } from "./proc";
import type { Failure, Packet, Profile } from "./types";
import { proofCommands } from "./verify";

export type PrepareResult = { ok: true; baseline: Record<string, number>; report: string[] } | { ok: false; failure: Failure };

export async function preparePacket(opts: {
  repo: string;
  dir: string;
  branch: string;
  from: string; // task branch head
  packet: Packet;
  profile: Profile;
  house: HouseSettings;
  env: NodeJS.ProcessEnv;
}): Promise<PrepareResult> {
  const { packet, profile } = opts;
  const wt = await git.worktree(opts.repo, opts.dir, opts.branch, opts.from);
  const run = (cmd: string) => shell(cmd, wt, LIMITS.commandTimeoutMs, opts.env);
  const report: string[] = [];

  if (profile.commands.setup) {
    const r = await run(profile.commands.setup);
    if (r.code !== 0)
      return {
        ok: false,
        failure: {
          class: "environment",
          message: `Installing dependencies failed in the packet's copy: ${profile.commands.setup}. Fix the machine or the setup command, then try again.`,
          report: r.out.trim().split("\n").slice(-25),
        },
      };
    report.push(`PASS  ${profile.commands.setup}  (install)`);
  }

  const baseline: Record<string, number> = {};
  for (const cmd of packet.verification) baseline[cmd] = (await run(cmd)).code;
  const failingBefore = packet.verification.filter((c) => baseline[c] !== 0);
  report.push(...packet.verification.map((c) => `${baseline[c] === 0 ? "passes" : "fails "} before the change: ${c}`));
  if (packet.kind === "change" && failingBefore.length === 0)
    return {
      ok: false,
      failure: {
        class: "bad_check",
        message: "Every check in this packet already passes before any change, so none of them can prove the work. The architect needs to aim a check at what's missing.",
        report,
      },
    };

  for (const cmd of [...proofCommands(profile, opts.house), ...packet.regression])
    if (!(cmd in baseline)) baseline[cmd] = (await run(cmd)).code;
  return { ok: true, baseline, report };
}
