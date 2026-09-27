/**
 * One contract for every agent engine. An agent gets a prompt and a working
 * folder, and must write its result as JSON to `outFile`. Nothing depends on an
 * engine's stream format — which is what lets Bob, Claude Code and the mock swap freely.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
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
};

export type AgentExit = { exitCode: number; timedOut: boolean; tail: string; sessionId?: string; costUsd?: number };

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
): Promise<AgentExit> {
  return new Promise((resolve) => {
    const log = fs.createWriteStream(r.logFile, { flags: "a" });
    log.write(`$ ${cmd} ${args.map((a) => (a.length > 80 ? `<${a.length} chars>` : a)).join(" ")}\n`);
    let tail = "";
    let buf = "";
    let timedOut = false;
    const child = spawn(cmd, args, { cwd: r.cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
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
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    const timer = setTimeout(() => {
      timedOut = true;
      log.write(`\n[arrow] time limit reached — asking the agent to stop\n`);
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 30_000).unref();
    }, r.timeoutMs);
    const done = (exitCode: number) => {
      clearTimeout(timer);
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
