import { NextResponse } from "next/server";
import { readHeartbeat } from "@/engine/store";

export const dynamic = "force-dynamic";

/** Is the background orchestrator alive, and which engine does each role use? */
export async function GET() {
  return NextResponse.json({ orchestrator: readHeartbeat() });
}
