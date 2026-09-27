import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { paths } from "@/engine/store";

export const dynamic = "force-dynamic";

/** The raw transcript of one agent run — the evidence behind a line in the activity log. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const job = new URL(req.url).searchParams.get("job") ?? "";
  if (!/^[a-f0-9-]{4,40}$/.test(job)) return NextResponse.json({ error: "Bad job id." }, { status: 400 });
  let file: string;
  try {
    file = path.join(paths(id).logs, `${job}.log`);
  } catch {
    return NextResponse.json({ error: "No such project." }, { status: 404 });
  }
  if (!fs.existsSync(file)) return NextResponse.json({ log: "" });
  const text = fs.readFileSync(file, "utf8");
  return NextResponse.json({ log: text.slice(-40_000), truncated: text.length > 40_000 });
}
