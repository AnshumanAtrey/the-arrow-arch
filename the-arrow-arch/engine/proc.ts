import { spawn } from "node:child_process";

export type ProcResult = { code: number; out: string; timedOut: boolean };

/** Kill a whole process group; quiet if it's already gone. */
export function killGroup(pid: number, signal: NodeJS.Signals = "SIGTERM") {
  try {
    process.kill(-pid, signal);
  } catch {
    /* already gone */
  }
}

/**
 * Run a program with an argument list (never a shell string). It runs as its own
 * process group, and whatever it leaves behind — a dev server, a headless browser —
 * is killed with it when it ends. Output is capped.
 */
export function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv; maxBytes?: number } = {},
): Promise<ProcResult> {
  const max = opts.maxBytes ?? 200_000;
  return new Promise((resolve) => {
    let out = "";
    let timedOut = false;
    const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env ?? process.env, stdio: ["ignore", "pipe", "pipe"], detached: true });
    const take = (b: Buffer) => {
      out += b.toString();
      if (out.length > max) out = out.slice(-max);
    };
    child.stdout.on("data", take);
    child.stderr.on("data", take);
    const timer =
      opts.timeoutMs &&
      setTimeout(() => {
        timedOut = true;
        if (child.pid) killGroup(child.pid);
        setTimeout(() => child.pid && killGroup(child.pid, "SIGKILL"), 10_000).unref();
      }, opts.timeoutMs);
    child.on("error", (e) => {
      if (timer) clearTimeout(timer);
      resolve({ code: 127, out: `${out}\n${e.message}`, timedOut });
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (child.pid) killGroup(child.pid); // reap what it started and left running
      resolve({ code: code ?? 1, out, timedOut });
    });
  });
}

/** A verification command is shell by design (the architect writes `bun test && ...`). */
export const shell = (line: string, cwd: string, timeoutMs: number, env?: NodeJS.ProcessEnv) =>
  run("/bin/sh", ["-c", line], { cwd, timeoutMs, env });

const BASE_VARS = ["PATH", "HOME", "USER", "LOGNAME", "SHELL", "TERM", "COLORTERM", "LANG", "TMPDIR", "TZ"];
/** The agent engines' own sign-in variables; everything else in your shell stays out. */
const ENGINE_PREFIXES = (process.env.ARROW_AGENT_ENV_PREFIXES ?? "ANTHROPIC_,CLAUDE_,BOB_,BOBSHELL_")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * The environment an agent or a check runs with: the basics, the engine's own
 * sign-in variables, and only the extra names a packet or the profile asked for.
 */
export function scrubbedEnv(extraNames: string[] = [], set: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    if (BASE_VARS.includes(k) || k.startsWith("LC_") || ENGINE_PREFIXES.some((p) => k.startsWith(p)) || extraNames.includes(k)) env[k] = v;
  }
  return { ...env, ...set, CI: "1" } as unknown as NodeJS.ProcessEnv;
}
