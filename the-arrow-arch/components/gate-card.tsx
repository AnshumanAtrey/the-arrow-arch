"use client";

import { useState } from "react";
import type { Gate, GateDecision, GateItem } from "@/engine/types";
import { act } from "@/lib/client";

type G = Gate & { decision?: GateDecision; note?: string };

const dot: Record<GateItem["level"], string> = { critical: "mark-accent", warning: "mark-ring", ok: "mark-quiet" };
const levelWord: Record<GateItem["level"], string> = { critical: "Critical", warning: "Worth a look", ok: "Fine" };

/**
 * A check a person signs: the rules check at onboarding, the plan check before
 * any worker runs, and the checkpoint after each phase of a phased task.
 * Green: nothing critical is touched — one click. Red: Arrow says continue or
 * stop and why, with what to do; the human decides. Or send it back: the same
 * agent looks again with your note, and a new check opens.
 */
export function GateCard({ pid, gate, onDone }: { pid: string; gate: G; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<GateDecision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showFine, setShowFine] = useState(false);
  const red = gate.verdict === "red";
  const rec = gate.recommendation;
  const phase = gate.kind === "phase";
  // a checkpoint's items are what landed and what's next — the content, not rules to hide
  const fine = phase ? [] : gate.items.filter((i) => i.level === "ok");
  const flagged = phase ? gate.items : gate.items.filter((i) => i.level !== "ok");
  const agent = gate.kind === "onboarding" ? "onboarder" : "architect";

  async function decide(decision: GateDecision) {
    if (decision === "revise" && !note.trim()) {
      setError(`Say what should change — the ${agent} works from that note.`);
      return;
    }
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

  const label = gate.kind === "onboarding" ? "Rules check for this repo" : gate.kind === "plan" ? `Plan check for ${gate.subject}` : `Checkpoint for ${gate.subject}`;
  const buttons: { d: GateDecision; text: string }[] = phase
    ? [{ d: "approve", text: "Plan the next phase" }, { d: "stop", text: "Stop here" }]
    : [
        ...(red
          ? rec.decision === "stop"
            ? [{ d: "stop" as const, text: "Stop here" }, { d: "approve" as const, text: "Continue anyway" }]
            : [{ d: "approve" as const, text: "Continue" }, { d: "stop" as const, text: "Stop here" }]
          : [{ d: "approve" as const, text: "Approve" }]),
        { d: "revise", text: `Send back to the ${agent}` },
      ];
  const busyWord: Record<GateDecision, string> = { approve: "Approving…", stop: "Stopping…", revise: "Sending back…" };
  const doneWord: Record<GateDecision, string> = { approve: "approved", stop: "stopped", revise: "sent back" };

  return (
    <section className={`rounded-lg border border-rule border-l-[3px] bg-white ${gate.decision ? "border-l-rule-strong" : red ? "border-l-accent" : "border-l-accent-line"}`}>
      <div className="px-5 pb-4 pt-4">
        <p className="text-[13px] text-ink-3">{label}</p>
        <h3 className="heading mt-0.5 text-[20px]">
          {phase ? gate.items[0]?.title : red ? "A critical rule is at stake" : flagged.length ? "All green, with notes" : "All green"}
        </h3>

        <div className={`mt-3 rounded-sm px-4 py-3 ${rec.decision === "stop" ? "bg-accent-soft" : "bg-well"}`}>
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
          You {doneWord[gate.decision]} this{gate.note ? `: “${gate.note}”` : "."}
        </p>
      ) : (
        <div className="flex flex-col gap-3 border-t border-rule px-5 py-4 sm:flex-row sm:items-end">
          <label className="flex-1 text-[13px] text-ink-2">
            {phase ? "Note for the architect planning the next phase (optional)" : `Note — for the record, or what the ${agent} should change if you send it back`}
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
              rows={2}
              className="mt-1 block w-full resize-y rounded-md border border-rule-strong bg-white px-3 py-2 text-[14px] text-ink"
              placeholder={phase ? "e.g. keep the next phase to the API; no UI yet" : red ? "Why you're continuing or stopping" : gate.kind === "plan" ? "e.g. P2 is too big — split the UI from the storage" : "e.g. rule R3 is critical, not normal"}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {buttons.map((b, i) => (
              <button
                key={b.d}
                type="button"
                disabled={busy !== null}
                onClick={() => decide(b.d)}
                className={`btn ${i === 0 ? "btn-accent" : "btn-secondary"}`}
              >
                {busy === b.d ? busyWord[b.d] : b.text}
              </button>
            ))}
          </div>
        </div>
      )}
      {error && <p className="px-5 pb-4 text-[14px] text-accent-ink" role="alert">{error}</p>}
    </section>
  );
}

function Items({ items }: { items: GateItem[] }) {
  return (
    <ul className="mt-3 divide-y divide-rule border-y border-rule">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3 py-2.5">
          <span className={`mark mt-[7px] ${dot[it.level]}`} aria-label={levelWord[it.level]} />
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
