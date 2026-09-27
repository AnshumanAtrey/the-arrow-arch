/**
 * The background orchestrator process: `bun run orchestrator`.
 * Watches every project's log, runs whatever can move, repeats.
 */
import { LIMITS } from "./config";
import { inflightCount, reconcile, tick } from "./orchestrator";
import { readSettings, ROLES } from "./settings";
import { listProjectIds, writeHeartbeat } from "./store";

const reconciled = new Set<string>();

async function loop() {
  for (const pid of listProjectIds()) {
    if (!reconciled.has(pid)) {
      reconcile(pid); // a restart never leaves a job stuck as "running"
      reconciled.add(pid);
    }
    try {
      await tick(pid);
    } catch (e) {
      console.error(`[arrow] ${pid}: ${(e as Error).message}`);
    }
  }
  const s = readSettings();
  writeHeartbeat({ pid: process.pid, at: new Date().toISOString(), drivers: Object.fromEntries(ROLES.map((r) => [r, s.roles[r].harness])), running: inflightCount() });
}

console.log(`[arrow] orchestrator up — ${LIMITS.parallelWorkers} parallel workers; engines come from Settings`);
await loop();
setInterval(() => void loop(), LIMITS.tickMs);
