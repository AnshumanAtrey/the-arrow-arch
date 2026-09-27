/**
 * The background orchestrator process: `bun run orchestrator`.
 * Watches every project's log, runs whatever can move, repeats.
 */
import { driverFor, LIMITS } from "./config";
import { inflightCount, reconcile, tick } from "./orchestrator";
import { listProjectIds, writeHeartbeat } from "./store";

const reconciled = new Set<string>();
const drivers = Object.fromEntries(["onboarder", "pm", "architect", "worker"].map((r) => [r, driverFor(r)]));

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
  writeHeartbeat({ pid: process.pid, at: new Date().toISOString(), drivers, running: inflightCount() });
}

console.log(`[arrow] orchestrator up — drivers ${JSON.stringify(drivers)}, ${LIMITS.parallelWorkers} parallel workers`);
await loop();
setInterval(() => void loop(), LIMITS.tickMs);
