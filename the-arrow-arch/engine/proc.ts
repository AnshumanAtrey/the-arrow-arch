import { spawn } from "node:child_process";

export type ProcResult = { code: number; out: string; timedOut: boolean };

/** Run a program with an argument list (never a shell string). Output is capped. */
export function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv; maxBytes?: number } = {},
): Promise<ProcResult> {
  const max = opts.maxBytes ?? 200_000;
  return new Promise((resolve) => {
    let out = "";
    let timedOut = false;
    const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env ?? process.env, stdio: ["ignore", "pipe", "pipe"] });
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
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 10_000).unref();
      }, opts.timeoutMs);
    child.on("error", (e) => {
      if (timer) clearTimeout(timer);
      resolve({ code: 127, out: `${out}\n${e.message}`, timedOut });
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code: code ?? 1, out, timedOut });
    });
  });
}

/** A verification command is shell by design (the architect writes `bun test && ...`). */
export const shell = (line: string, cwd: string, timeoutMs: number) => run("/bin/sh", ["-c", line], { cwd, timeoutMs });
