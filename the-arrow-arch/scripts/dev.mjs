// `npm run dev` / `bun run dev`: the UI and the background orchestrator together.
// Ctrl-C stops both.
import { spawn } from "node:child_process";

const procs = [
  spawn("bun", ["engine/daemon.ts"], { stdio: "inherit" }),
  spawn("npx", ["next", "dev", "-p", "7777"], { stdio: "inherit" }),
];
const stop = () => procs.forEach((p) => p.kill("SIGTERM"));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
procs.forEach((p) => p.on("exit", (code) => { stop(); process.exitCode = code ?? 0; }));
