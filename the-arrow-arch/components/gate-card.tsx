"use client";

import { useState } from "react";
import type { Gate, GateDecision, GateItem } from "@/engine/types";
import { act } from "@/lib/client";

type G = Gate & { decision?: GateDecision; note?: string };

const dot: Record<GateItem["level"], string> = { critical: "bg-red", warning: "bg-gold", ok: "bg-green" };
const levelWord: Record<GateItem["level"], string> = { critical: "Critical", warning: "Worth a look", ok: "Fine" };

/**
 * The rules check, at onboarding or before any worker runs.
 * Green: nothing critical is touched — one click. Red: Arrow says continue or
 * stop and why, with what to do; the human decides.
 */
export function GateCard({ pid, gate, onDone }: { pid: string; gate: G; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<GateDecision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showFine, setShowFine] = useState(false);
  const red = gate.verdict === "red";
  const rec = gate.recommendation;
  const fine = gate.items.filter((i) => i.level === "ok");
  const flagged = gate.items.filter((i) => i.level !== "ok");

  async function decide(decision: GateDecision) {
    setBusy(decision);
    setError(null);
    try {
      await act(pid, { type: "decide_gate", gateId: gate.id, decision, note: note.trim() || undefined });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const label = gate.kind === "onboarding" ? "Rules check for this repo" : `Plan check for ${gate.subject}`;
  const buttons: { d: GateDecision; text: string }[] = red
    ? rec.decision === "stop"
      ? [{ d: "stop", text: "Stop here" }, { d: "approve", text: "Continue anyway" }]
      : [{ d: "approve", text: "Continue" }, { d: "stop", text: "Stop here" }]
    : [{ d: "approve", text: "Approve" }];

  return (
    <section className={`rounded-lg border border-rule bg-panel ${red ? "border-l-[5px] border-l-red" : "border-l-[5px] border-l-green"}`}>
      <div className="px-5 pb-4 pt-4">
        <p className="text-[13px] text-ink-3">{label}</p>
        <h3 className="heading mt-0.5 text-[20px]">
          {red ? "A critical rule is at stake" : flagged.length ? "All green, with notes" : "All green"}
        </h3>

        <div className={`mt-3 rounded-md px-4 py-3 ${rec.decision === "stop" ? "bg-red-soft" : "bg-green-soft"}`}>
          <p className="text-[14px]">
            <span className="heading">Arrow&apos;s call: {rec.decision === "stop" ? "stop" : "continue"}.</span> {rec.reason}
          </p>
          {rec.suggestions.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px] text-ink-2">
              {rec.suggestions.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}
        </div>

        {flagged.length > 0 && <Items items={flagged} />}
        {fine.length > 0 && (
          <div className="mt-3">
            <button type="button" className="text-[13px] text-ink-2 underline decoration-rule-strong underline-offset-4 hover:text-ink" onClick={() => setShowFine((v) => !v)} aria-expanded={showFine}>
              {showFine ? "Hide" : "Show"} {fine.length} rule{fine.length === 1 ? "" : "s"} already fine
            </button>
            {showFine && <Items items={fine} />}
          </div>
        )}
      </div>

      {gate.decision ? (
        <p className="border-t border-rule px-5 py-3 text-[14px] text-ink-2">
          You {gate.decision === "approve" ? "approved" : "stopped"} this{gate.note ? `: “${gate.note}”` : "."}
        </p>
      ) : (
        <div className="flex flex-col gap-3 border-t border-rule px-5 py-4 sm:flex-row sm:items-end">
          <label className="flex-1 text-[13px] text-ink-2">
            Note for the record (optional)
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
              className="mt-1 block w-full rounded-md border border-rule bg-paper px-3 py-2 text-[14px] text-ink"
              placeholder={red ? "Why you're continuing or stopping" : ""}
            />
          </label>
          <div className="flex gap-2">
            {buttons.map((b, i) => (
              <button
                key={b.d}
                type="button"
                disabled={busy !== null}
                onClick={() => decide(b.d)}
                className={`rounded-md px-4 py-2 text-[14px] font-semibold disabled:opacity-60 ${
                  i === 0
                    ? b.d === "stop"
                      ? "bg-red text-white"
                      : "bg-green text-white"
                    : "border border-rule-strong bg-panel text-ink hover:border-ink"
                }`}
              >
                {busy === b.d ? (b.d === "stop" ? "Stopping…" : "Approving…") : b.text}
              </button>
            ))}
          </div>
        </div>
      )}
      {error && <p className="px-5 pb-4 text-[14px] text-red" role="alert">{error}</p>}
    </section>
  );
}

function Items({ items }: { items: GateItem[] }) {
  return (
    <ul className="mt-3 divide-y divide-rule border-y border-rule">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3 py-2.5">
          <span className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${dot[it.level]}`} aria-label={levelWord[it.level]} />
          <div className="min-w-0 text-[14px]">
            <p className="text-ink">
              {it.ruleId && <span className="mr-1.5 font-mono text-[12px] text-ink-3">{it.ruleId}</span>}
              {it.title}
            </p>
            <p className="text-ink-2">{it.detail}</p>
            {it.suggestion && <p className="mt-0.5 text-ink-2"><span className="text-ink">What to do:</span> {it.suggestion}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}
