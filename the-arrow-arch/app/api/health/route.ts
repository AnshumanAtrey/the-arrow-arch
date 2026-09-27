import { NextResponse } from "next/server";
import { readSettings } from "@/engine/settings";
import { readHeartbeat } from "@/engine/store";

export const dynamic = "force-dynamic";

/** Is the background orchestrator alive, which engine does each role use, and can Bob sign in? */
export async function GET() {
  const s = readSettings();
  const usesBob = Object.values(s.roles).some((r) => r.harness === "bob");
  return NextResponse.json({
    orchestrator: readHeartbeat(),
    bobKey: usesBob ? Boolean(s.keys.BOB_API_KEY || process.env.BOB_API_KEY) : null,
  });
}
