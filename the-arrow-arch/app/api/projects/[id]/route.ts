import fs from "node:fs";
import { NextResponse } from "next/server";
import { LIMITS } from "@/engine/config";
import { effectiveSettings } from "@/engine/house-rules";
import { readLedger } from "@/engine/ledger-scan";
import { metrics, taskNumbers } from "@/engine/metrics";
import { project } from "@/engine/project";
import { paths, readEvents } from "@/engine/store";
import { nowLine } from "@/engine/transcript";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let p;
  try {
    p = paths(id);
  } catch {
    return NextResponse.json({ error: "No such project." }, { status: 404 });
  }
  if (!fs.existsSync(p.events)) return NextResponse.json({ error: "No such project." }, { status: 404 });
  const events = readEvents(id);
  const state = project(id, events);
  const now = Date.now();
  const approved = Boolean(state.onboardingGateId && state.gates[state.onboardingGateId]?.decision === "approve");
  // the ledger is written only by the orchestrator; the UI just reads it
  return NextResponse.json({
    state,
    metrics: metrics(state),
    ledger: readLedger(id),
    house: state.profile ? effectiveSettings(state.profile.houseRules, approved) : null,
    numbers: Object.fromEntries(state.taskOrder.map((t) => [t, taskNumbers(state, t, events, now)])),
    now: nowLines(p.logs, state),
    // the finished work of each task opens at <preview>/<task>/ (served by the orchestrator, another origin)
    preview: `http://localhost:${LIMITS.previewPort}/${id}`,
  });
}

/** For each agent running right now: the last thing it did, read off the end of its log. */
function nowLines(logs: string, state: ReturnType<typeof project>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const j of Object.values(state.jobs)) {
    if (j.finishedAt || j.role === "orchestrator") continue;
    try {
      const file = `${logs}/${j.jobId}.log`;
      const size = fs.statSync(file).size;
      const fd = fs.openSync(file, "r");
      const buf = Buffer.alloc(Math.min(size, 64_000));
      fs.readSync(fd, buf, 0, buf.length, size - buf.length);
      fs.closeSync(fd);
      const line = nowLine(buf.toString("utf8"));
      if (line) out[j.jobId] = line;
    } catch {
      /* no log yet */
    }
  }
  return out;
}
