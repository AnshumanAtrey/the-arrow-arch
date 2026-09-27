"use client";

import Link from "next/link";
import { usePoll } from "@/lib/client";

type Health = { orchestrator: { live: boolean; drivers: Record<string, string>; running: number; at: string } | null; bobKey: boolean | null };

/** Header strip: is the background orchestrator alive, and is anything real behind the agents? */
export function EngineStatus() {
  const { data } = usePoll<Health>("/api/health", 3000);
  const o = data?.orchestrator;
  const engines = o ? [...new Set(Object.values(o.drivers))] : [];
  const mock = engines.includes("mock");

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-2">
      <span className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${o?.live ? "bg-green" : "bg-red"}`} aria-hidden="true" />
        {o?.live ? (
          <>Orchestrator running{o.running ? `, ${o.running} step${o.running === 1 ? "" : "s"} in progress` : ""}</>
        ) : (
          <>
            Orchestrator is not running. Start it with <code className="font-mono text-ink">bun run orchestrator</code>
          </>
        )}
      </span>
      {o && (
        <span title={Object.entries(o.drivers).map(([r, d]) => `${r}: ${d}`).join("\n")}>
          Agents: {engines.join(", ")}
          {mock && <span className="ml-2 rounded bg-gold-soft px-1.5 py-0.5 text-gold-ink">mock — no model is called</span>}
        </span>
      )}
      {data?.bobKey === false && (
        <Link href="/settings" className="rounded bg-red-soft px-1.5 py-0.5 text-red">Bob needs an API key — add it in Settings</Link>
      )}
    </div>
  );
}
