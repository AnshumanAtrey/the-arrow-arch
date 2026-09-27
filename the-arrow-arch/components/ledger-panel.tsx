"use client";

import type { Ledger } from "@/engine/ledger";
import type { ProjectState } from "@/engine/types";
import { ago } from "@/lib/client";

const roleWords: Record<string, string> = { onboarder: "Onboarder", pm: "Project manager", architect: "Architect", worker: "Worker", orchestrator: "Arrow" };

/**
 * What is going on right now. Nobody edits this — the orchestrator rebuilds it
 * from the processes, ports and worktrees that actually exist, and cleans up
 * anything a finished agent left behind.
 */
export function LedgerPanel({ ledger, state }: { ledger: Ledger | null; state: ProjectState }) {
  if (!ledger) return <p className="text-[14px] text-ink-3">The orchestrator hasn&apos;t written the ledger yet. It does every few seconds once the repo is copied.</p>;
  const reaped = [...state.reaped].reverse().slice(0, 8);
  return (
    <div className="space-y-6 text-[14px]">
      <p className="text-[13px] text-ink-3">Read-only. Rebuilt by the orchestrator from what is actually running, {ago(ledger.at)}.</p>

      <Block title="Agents running" empty="No agent is running.">
        {ledger.agents.map((a) => (
          <Row key={a.jobId} left={roleWords[a.role] ?? a.role} right={a.port ? `ports from ${a.port}` : a.pid ? `pid ${a.pid}` : ""}>
            {a.packet ?? a.subject}
            {a.files.length > 0 && <span className="block truncate font-mono text-[12px] text-ink-3">{a.files.join(", ")}</span>}
          </Row>
        ))}
      </Block>

      <Block title="Worktrees" empty="No packet has a worktree right now.">
        {ledger.worktrees.map((w) => (
          <Row key={w.path} left={w.packet ?? "?"} right={w.status === "stale" ? "cleaning up" : w.status}>
            <span className="font-mono text-[12px] text-ink-3">{w.branch}</span>
            {w.why && <span className="block text-[13px] text-ink-3">{w.why}</span>}
          </Row>
        ))}
      </Block>

      <Block title="Local servers" empty="Nothing is listening on a port.">
        {ledger.services.map((sv) => (
          <Row key={`${sv.port}-${sv.pid}`} left={String(sv.port)} right={sv.stale ? "stale, being stopped" : ""}>
            {sv.owner} <span className="text-ink-3">({sv.command})</span>
          </Row>
        ))}
      </Block>

      {reaped.length > 0 && (
        <Block title="Cleaned up" empty="">
          {reaped.map((r, i) => (
            <Row key={i} left={r.kind === "process" ? "Process" : "Worktree"} right={ago(r.at)}>
              {r.what} <span className="text-ink-3">— {r.why}</span>
            </Row>
          ))}
        </Block>
      )}
    </div>
  );
}

function Block({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <div>
      <h3 className="heading mb-1.5 text-[14px]">{title}</h3>
      {children.length === 0 ? <p className="text-ink-3">{empty}</p> : <ul className="divide-y divide-rule border-y border-rule">{children}</ul>}
    </div>
  );
}

function Row({ left, right, children }: { left: string; right?: string; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[7rem_1fr_auto] gap-x-3 py-2">
      <span className="text-ink-2">{left}</span>
      <span className="min-w-0">{children}</span>
      <span className="text-right text-[13px] text-ink-3">{right}</span>
    </li>
  );
}
