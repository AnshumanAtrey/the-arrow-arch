import { NextResponse } from "next/server";
import { z } from "zod";
import { run } from "@/engine/proc";
import { HARNESSES, KEY_NAMES, publicSettings, readSettings, ROLES, Settings, writeSettings } from "@/engine/settings";
import { fromThisSite } from "@/lib/same-site";

export const dynamic = "force-dynamic";

/** Is Bob Shell installed here? Checked on demand; the answer is cheap. */
async function bobStatus() {
  const r = await run(process.env.ARROW_BOB_CMD || "bob", ["--version"], { timeoutMs: 10_000 });
  return r.code === 0 ? { installed: true, version: r.out.trim().split("\n")[0] } : { installed: false, version: "" };
}

export async function GET() {
  const s = readSettings();
  return NextResponse.json({ settings: publicSettings(s), bob: await bobStatus(), harnesses: HARNESSES, roles: ROLES });
}

const Body = z.object({
  roles: Settings.shape.roles.optional(),
  bob: Settings.shape.bob.optional(),
  // a value sets the key, "" leaves it as it is, null removes it
  keys: z.partialRecord(z.enum(KEY_NAMES), z.string().max(500).nullable()).optional(),
});

export async function PUT(req: Request) {
  if (!fromThisSite(req)) return NextResponse.json({ error: "Settings change only from Arrow's own pages." }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid settings." }, { status: 400 });
  const cur = readSettings();
  const keys = { ...cur.keys };
  for (const [k, v] of Object.entries(parsed.data.keys ?? {}) as [keyof typeof keys, string | null][]) {
    if (v === null) delete keys[k];
    else if (v.trim()) keys[k] = v.trim();
  }
  const next = Settings.parse({ roles: parsed.data.roles ?? cur.roles, bob: parsed.data.bob ?? cur.bob, keys });
  writeSettings(next);
  return NextResponse.json({ settings: publicSettings(next) });
}
