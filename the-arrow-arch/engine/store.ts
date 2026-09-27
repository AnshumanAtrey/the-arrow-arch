/**
 * The state manager's storage: one append-only JSONL log per project, plus a
 * folder for the cloned repo, worktrees, agent logs and result files.
 * Writers only ever append a line; readers fold the lines into state.
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./config";
import type { ArrowEvent, NewEvent } from "./types";

export const projectsDir = () => path.join(DATA_DIR, "projects");

export function paths(pid: string) {
  if (!/^[a-z0-9-]+$/.test(pid)) throw new Error(`bad project id: ${pid}`);
  const dir = path.join(projectsDir(), pid);
  return {
    dir,
    events: path.join(dir, "events.jsonl"),
    repo: path.join(dir, "repo"),
    worktrees: path.join(dir, "worktrees"),
    logs: path.join(dir, "logs"),
  };
}

export function append(pid: string, event: NewEvent): ArrowEvent {
  const full = { ...event, at: new Date().toISOString() } as ArrowEvent;
  const p = paths(pid);
  fs.mkdirSync(p.dir, { recursive: true });
  // one write() per line with O_APPEND: concurrent appenders never interleave a line
  fs.appendFileSync(p.events, JSON.stringify(full) + "\n");
  return full;
}

export function readEvents(pid: string): ArrowEvent[] {
  const p = paths(pid);
  if (!fs.existsSync(p.events)) return [];
  const out: ArrowEvent[] = [];
  for (const line of fs.readFileSync(p.events, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // a torn last line from a crash mid-write: skip it, the next append starts clean
    }
  }
  return out;
}

export function listProjectIds(): string[] {
  const d = projectsDir();
  if (!fs.existsSync(d)) return [];
  return fs
    .readdirSync(d)
    .filter((n) => fs.existsSync(path.join(d, n, "events.jsonl")))
    .sort();
}

export function newProjectId(repoUrl: string): string {
  const base = repoUrl
    .replace(/\.git$/, "")
    .split(/[/:]/)
    .filter(Boolean)
    .pop()!
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32) || "repo";
  return `${base}-${randomUUID().slice(0, 4)}`;
}

export const newJobId = () => randomUUID().slice(0, 8);

// ------------------------------------------------------------ orchestrator heartbeat

const heartbeatFile = () => path.join(DATA_DIR, "orchestrator.json");

export type Heartbeat = { pid: number; at: string; drivers: Record<string, string>; running: number };

export function writeHeartbeat(h: Heartbeat) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(heartbeatFile(), JSON.stringify(h));
}

export function readHeartbeat(): (Heartbeat & { live: boolean }) | null {
  try {
    const h = JSON.parse(fs.readFileSync(heartbeatFile(), "utf8")) as Heartbeat;
    return { ...h, live: Date.now() - Date.parse(h.at) < 10_000 };
  } catch {
    return null;
  }
}
