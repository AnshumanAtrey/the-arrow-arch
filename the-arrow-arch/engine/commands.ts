/**
 * A profile command is run exactly as typed, in a fresh copy of the repo. One
 * that isn't valid shell — "pip install -r requirements.txt (run inside an
 * actor's folder)" — describes a command rather than being one: Arrow leaves it
 * out instead of failing every packet on it. `sh -n` only parses; nothing runs.
 */
import { run } from "./proc";
import type { Profile } from "./types";

const parsed = new Map<string, boolean>();

export async function runnableCommands(commands: Profile["commands"]): Promise<Profile["commands"]> {
  const out: Profile["commands"] = {};
  for (const [k, v] of Object.entries(commands) as [keyof Profile["commands"], string | undefined][]) {
    if (!v?.trim()) continue;
    if (!parsed.has(v)) parsed.set(v, (await run("/bin/sh", ["-n", "-c", v], { timeoutMs: 5000 })).code === 0);
    if (parsed.get(v)) out[k] = v;
  }
  return out;
}
