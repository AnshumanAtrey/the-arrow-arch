import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { paths } from "@/engine/store";
import { readTranscript } from "@/engine/transcript";

export const dynamic = "force-dynamic";

const MAX_BYTES = 8_000_000;

/** One agent run, read back: the exact prompt it was given and every step it took. */
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
  if (!fs.existsSync(file)) return NextResponse.json({ transcript: null });
  const size = fs.statSync(file).size;
  // the prompt is at the top, so a huge log keeps its head and loses the middle of its output, never the prompt
  let text = fs.readFileSync(file, "utf8");
  if (size > MAX_BYTES) text = `${text.slice(0, MAX_BYTES / 2)}\n${text.slice(-MAX_BYTES / 2)}`;
  return NextResponse.json({ transcript: readTranscript(text), bytes: size });
}
