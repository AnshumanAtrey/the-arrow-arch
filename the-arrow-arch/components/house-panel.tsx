"use client";

import { useState } from "react";
import { HOUSE_RULES, normaliseOutcomes, type HouseSettings } from "@/engine/house-rules";
import type { ProjectState } from "@/engine/types";
import { act } from "@/lib/client";

const outcomeWords = { keep: "Arrow's default", replace: "Your company's version", dont_grow: "Don't grow", conflict: "Conflict" } as const;

/** One line per house rule: what onboarding decided and the value Arrow runs with. */
function valueOf(id: string, h: HouseSettings): string {
  switch (id) {
    case "H-FILESIZE": return `target ${h.fileSize.targetLines}, cap ${h.fileSize.maxLines} lines`;
    case "H-DOCS": return h.docs.allowPaths.length ? `docs allowed in ${h.docs.allowPaths.join(", ")}` : "no new .md files";
    case "H-TESTS": return h.tests.mayEditExisting ? "existing tests may be edited" : "existing tests only gain cases";
    case "H-DEPS": return h.dependencies.requireApproval ? `approval needed${h.dependencies.approved.length ? `, pre-approved: ${h.dependencies.approved.join(", ")}` : ""}` : "no approval needed";
    case "H-PLACEHOLDERS": return h.placeholders.allowedPattern ? `allowed only as ${h.placeholders.allowedPattern}` : "none allowed";
    case "H-DIFF": return `${h.diff.maxChangedLines} changed lines per packet`;
    case "H-PROOF": return `always runs: ${h.proof.always.join(", ")}`;
    case "H-LOOPS": return `${h.loops.codeRetries} retry, ${h.loops.repairs} re-plan`;
    case "H-PORTS": return `from ${h.ports.base}, ${h.ports.perWorker} per worker`;
    default: return "always on";
  }
}

export function HousePanel({ pid, state, house, onDone }: { pid: string; state: ProjectState; house: HouseSettings; onDone: () => void }) {
  const outcomes = normaliseOutcomes(state.profile?.houseRules);
  return (
    <div className="space-y-6 text-[14px]">
      <ul className="divide-y divide-rule border-y border-rule">
        {HOUSE_RULES.map((r) => {
          const o = outcomes.find((x) => x.id === r.id)!;
          return (
            <li key={r.id} className="py-2">
              <div className="flex items-baseline justify-between gap-3">
                <span>{r.title}</span>
                <span className={`shrink-0 text-[12px] ${o.outcome === "conflict" ? "text-red" : o.outcome === "keep" ? "text-ink-3" : "text-gold-ink"}`}>{outcomeWords[o.outcome]}</span>
              </div>
              <p className="text-[13px] text-ink-3">
                {valueOf(r.id, house)}
                {r.criticality === "critical" && <span className="ml-2 rounded bg-red-soft px-1 text-red">critical</span>}
              </p>
              {o.why && <p className="text-[13px] text-ink-2">{o.why}</p>}
            </li>
          );
        })}
      </ul>
      <Knowledge state={state} />
      <Freeze pid={pid} state={state} onDone={onDone} />
    </div>
  );
}

function Knowledge({ state }: { state: ProjectState }) {
  const items = [...state.knowledge].reverse().slice(0, 12);
  return (
    <div>
      <h3 className="heading mb-1.5 text-[14px]">Decisions and facts on record <span className="font-normal text-ink-3">({state.knowledge.length})</span></h3>
      {items.length === 0 ? (
        <p className="text-ink-3">Nothing yet. Your answers, your notes at a check, and what workers learn are recorded here the moment they happen — every agent reads them.</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((k) => (
            <li key={k.id}>
              <span className="mr-1.5 font-mono text-[12px] text-ink-3">{k.id}</span>
              {k.text} <span className="text-[13px] text-ink-3">— {k.source}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Freeze({ pid, state, onDone }: { pid: string; state: ProjectState; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const frozen = Boolean(state.frozen);
  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      await act(pid, { type: "freeze", frozen: !frozen });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={`rounded-md px-4 py-3 ${frozen ? "bg-blue-soft" : "bg-paper"}`}>
      <p className="heading text-[14px]">{frozen ? "Code freeze is on" : "Code freeze"}</p>
      <p className="text-[13px] text-ink-2">
        {frozen ? "No worker starts and nothing lands. Planning continues. Steps already running finish." : "Stops new work and landing on this repo until you lift it."}
      </p>
      <button type="button" onClick={toggle} disabled={busy} className="mt-2 rounded-md border border-rule-strong bg-panel px-3 py-1.5 text-[13px] hover:border-ink disabled:opacity-50">
        {busy ? "Saving…" : frozen ? "Lift the freeze" : "Freeze this repo"}
      </button>
      {error && <p className="mt-1 text-[13px] text-red" role="alert">{error}</p>}
    </div>
  );
}
