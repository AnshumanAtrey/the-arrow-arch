"use client";

import Link from "next/link";
import { useState } from "react";
import type { ProjectState, TaskView } from "@/engine/types";
import { act } from "@/lib/client";
import { needsOf } from "@/lib/needs";
import { GateCard } from "./gate-card";

/** Everything waiting on the human, in one place, each answerable right here. */
export function NeedsYou({ pid, state, taskId, onDone }: { pid: string; state: ProjectState; taskId?: string; onDone: () => void }) {
  const needs = needsOf(state).filter((n) => !taskId || n.taskId === taskId);
  if (!needs.length) return null;
  return (
    <div className="space-y-4">
      {needs.map((n) =>
        n.kind === "gate" ? (
          <GateCard key={n.key} pid={pid} gate={state.gates[n.gateId]} onDone={onDone} />
        ) : n.kind === "questions" ? (
          <QuestionsCard key={n.key} pid={pid} task={state.tasks[n.taskId]} onDone={onDone} linked={!taskId} />
        ) : (
          <PausedCard key={n.key} pid={pid} subject={n.subject} title={n.title} reason={n.reason} taskId={n.taskId} onDone={onDone} />
        ),
      )}
    </div>
  );
}

export function QuestionsCard({ pid, task, onDone, linked }: { pid: string; task: TaskView; onDone: () => void; linked?: boolean }) {
  const qs = task.spec?.questions ?? [];
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = qs.every((q) => answers[q.id]?.trim());

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await act(pid, { type: "answer", taskId: task.taskId, answers });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-rule border-l-[5px] border-l-gold bg-panel px-5 py-4">
      <p className="text-[13px] text-ink-3">
        {linked ? <Link className="underline underline-offset-4" href={`/p/${pid}/t/${task.taskId}`}>{task.taskId}</Link> : task.taskId}, from the project manager
      </p>
      <h3 className="heading mt-0.5 text-[20px]">{qs.length === 1 ? "One question before planning" : `${qs.length} questions before planning`}</h3>
      <p className="mt-1 text-[14px] text-ink-2">The architect plans once you answer. Nothing else will be asked unless a critical rule comes up.</p>
      <div className="mt-4 space-y-5">
        {qs.map((q) => (
          <fieldset key={q.id}>
            <legend className="measure text-[15px] text-ink">{q.question}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {q.options.map((o) => (
                <button
                  key={o}
                  type="button"
                  aria-pressed={answers[q.id] === o}
                  onClick={() => setAnswers((a) => ({ ...a, [q.id]: o }))}
                  className={`rounded-md border px-3 py-1.5 text-[14px] ${answers[q.id] === o ? "border-ink bg-ink text-paper" : "border-rule-strong bg-panel text-ink hover:border-ink"}`}
                >
                  {o}
                </button>
              ))}
            </div>
            <input
              aria-label={`Your own answer to ${q.id}`}
              placeholder="Or write your own answer"
              value={q.options.includes(answers[q.id] ?? "") ? "" : (answers[q.id] ?? "")}
              onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
              className="mt-2 block w-full max-w-lg rounded-md border border-rule bg-paper px-3 py-2 text-[14px]"
            />
          </fieldset>
        ))}
      </div>
      <button type="button" disabled={!ready || busy} onClick={send} className="mt-4 rounded-md bg-ink px-4 py-2 text-[14px] font-semibold text-paper disabled:opacity-50">
        {busy ? "Sending…" : "Send answers"}
      </button>
      {error && <p className="mt-2 text-[14px] text-red" role="alert">{error}</p>}
    </section>
  );
}

function PausedCard({ pid, subject, title, reason, taskId, onDone }: { pid: string; subject: string; title: string; reason: string; taskId?: string; onDone: () => void }) {
  const [busy, setBusy] = useState<"retry" | "halt" | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function run(kind: "retry" | "halt") {
    setBusy(kind);
    setError(null);
    try {
      await act(pid, kind === "retry" ? { type: "retry", subject } : { type: "halt", taskId });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="rounded-lg border border-rule border-l-[5px] border-l-gold bg-panel px-5 py-4">
      <h3 className="heading text-[18px]">{title}</h3>
      <p className="measure mt-1 whitespace-pre-line text-[14px] text-ink-2">{reason}</p>
      <p className="mt-1 text-[13px] text-ink-3">The loop manager stopped retrying so it doesn&apos;t spend more on the same wall. Everything done so far is kept.</p>
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={busy !== null} onClick={() => run("retry")} className="rounded-md bg-ink px-4 py-2 text-[14px] font-semibold text-paper disabled:opacity-50">
          {busy === "retry" ? "Resuming…" : "Try again"}
        </button>
        {taskId && (
          <button type="button" disabled={busy !== null} onClick={() => run("halt")} className="rounded-md border border-rule-strong bg-panel px-4 py-2 text-[14px] hover:border-ink disabled:opacity-50">
            {busy === "halt" ? "Stopping…" : `Stop ${taskId}`}
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-[14px] text-red" role="alert">{error}</p>}
    </section>
  );
}
