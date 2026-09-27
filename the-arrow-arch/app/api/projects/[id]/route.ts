import fs from "node:fs";
import { NextResponse } from "next/server";
import { metrics } from "@/engine/metrics";
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
  const state = project(id, readEvents(id));
  return NextResponse.json({ state, metrics: metrics(state) });
}
