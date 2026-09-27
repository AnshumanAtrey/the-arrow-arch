/**
 * One contract for every agent engine. An agent gets a prompt and a working
 * folder, and must write its result as JSON to `outFile`. Nothing depends on an
 * engine's stream format — which is what lets Bob, Claude Code and the mock swap freely.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import { killGroup } from "../proc";
import type { RoleCfg, Settings } from "../settings";
import type { Role } from "../types";

export type AgentRun = {
  role: Role;
  jobId: string;
  cwd: string;
  prompt: string;
  outFile: string;
  logFile: string;
  timeoutMs: number;
  resume?: string; // an earlier session to continue, if the engine supports it
  input: unknown; //  the same inputs the prompt carries, structured (the mock reads these)
  env: NodeJS.ProcessEnv; // scrubbed: the basics, the engine's sign-in, and what the packet names
  onSpawn?: (pid: number) => void; // the process group the orchestrator must account for
  cfg: RoleCfg; //          which harness / provider / model this role runs on
  bob: Settings["bob"];
};

export type Usage = { input: number; output: number; cacheRead: number; total: number };
export type AgentExit = {
  exitCode: number;
  timedOut: boolean;
  tail: string;
  sessionId?: string;
  usage?: Usage;
  cost?: number;
  costUnit?: "usd" | "bobcoins";
};

export type Driver = (r: AgentRun) => Promise<AgentExit>;

/**
 * Spawn an agent CLI, stream its output into the log file, and on time-out ask
 * it to stop (SIGTERM) before forcing it — so it gets a chance to save work.
 */
export function spawnLogged(
  cmd: string,
  args: string[],
  r: AgentRun,
  onLine?: (line: string) => void,
  stdin?: string, // the prompt, when the engine reads it from stdin (keeps it out of `ps`)
): Promise<AgentExit> {
  return new Promise((resolve) => {
    const log = fs.createWriteStream(r.logFile, { flags: "a" });
    log.write(`$ ${cmd} ${args.map((a) => (a.length > 80 ? `<${a.length} chars>` : a)).join(" ")}\n`);
    let tail = "";
    let buf = "";
    let timedOut = false;
    // its own process group: anything it starts can be found and reaped with it
    const child = spawn(cmd, args, { cwd: r.cwd, env: r.env, stdio: [stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"], detached: true });
    if (child.pid) r.onSpawn?.(child.pid);
    if (stdin !== undefined && child.stdin) {
      child.stdin.on("error", () => {}); // the engine may exit before reading it all
      child.stdin.end(stdin);
    }
    const onData = (b: Buffer) => {
      const s = b.toString();
      log.write(s);
      tail = (tail + s).slice(-8000);
      if (!onLine) return;
      buf += s;
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const l of lines) onLine(l);
    };
    child.stdout!.on("data", onData);
    child.stderr!.on("data", onData);
    const timer = setTimeout(() => {
      timedOut = true;
      log.write(`\n[arrow] time limit reached — asking the agent to stop\n`);
      if (child.pid) killGroup(child.pid, "SIGTERM");
      setTimeout(() => child.pid && killGroup(child.pid, "SIGKILL"), 30_000).unref();
    }, r.timeoutMs);
    const done = (exitCode: number) => {
      clearTimeout(timer);
      if (child.pid) killGroup(child.pid); // whatever it left running goes with it
      if (buf && onLine) onLine(buf);
      log.end();
      resolve({ exitCode, timedOut, tail });
    };
    child.on("error", (e) => {
      tail += `\n${e.message}`;
      done(127);
    });
    child.on("close", (code) => done(code ?? 1));
  });
}
