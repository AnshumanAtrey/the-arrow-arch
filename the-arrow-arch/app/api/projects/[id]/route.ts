import fs from "node:fs";
import { NextResponse } from "next/server";
import { effectiveSettings } from "@/engine/house-rules";
import { readLedger } from "@/engine/ledger-scan";
import { metrics, taskNumbers } from "@/engine/metrics";
import { project } from "@/engine/project";
import { paths, readEvents } from "@/engine/store";

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
  });
}
