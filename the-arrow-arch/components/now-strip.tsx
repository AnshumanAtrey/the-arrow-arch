"use client";

import type { ProjectState } from "@/engine/types";
import { labelOf } from "@/lib/needs";

const roleWords = { onboarder: "Onboarder", pm: "Project manager", architect: "Architect", worker: "Worker", orchestrator: "Arrow", human: "You" } as const;

const elapsed = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
};

/** Who is running right now, on what, for how long, and the last thing each agent did. */
export function NowStrip({ s, now, taskId }: { s: ProjectState; now: Record<string, string>; taskId?: string }) {
  const running = Object.values(s.jobs)
    .filter((j) => !j.finishedAt && (!taskId || j.subject.startsWith(`${taskId}:`)))
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  if (!running.length) return <p className="text-[14px] text-ink-3">Nothing is running right now.</p>;
  return (
    <ul className="divide-y divide-rule border-y border-rule text-[14px]">
      {running.map((j) => (
        <li key={j.jobId} className="grid grid-cols-[7.5rem_1fr_auto] items-baseline gap-x-3 py-2">
          <span className="inline-flex items-center gap-2 text-ink-2">
            <span className="mark mark-run" aria-hidden="true" />
            {roleWords[j.role]}
          </span>
          <span className="min-w-0">
            {labelOf(j.subject)}
            {j.port && <span className="text-ink-3"> · ports from {j.port}</span>}
            {now[j.jobId] && <span className="block truncate font-mono text-[12px] text-ink-3">{now[j.jobId]}</span>}
          </span>
          <span className="text-[13px] text-ink-3">{elapsed(j.startedAt)}</span>
        </li>
      ))}
    </ul>
  );
}
