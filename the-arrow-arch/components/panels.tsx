"use client";

import Link from "next/link";
import { useState } from "react";
import type { Metrics } from "@/engine/metrics";
import type { JobView, PacketStatus, Profile, ProjectState, TaskStage, TaskView } from "@/engine/types";
import { act, ago, duration } from "@/lib/client";
import { labelOf } from "@/lib/needs";

export function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <div className="mb-3 flex items-baseline justify-between gap-4 border-b border-rule pb-2">
        <h2 className="heading text-[18px]">{title}</h2>
        {aside && <div className="text-[13px] text-ink-3">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

// ------------------------------------------------------------------ what Arrow learned

export function ProfilePanel({ profile }: { profile: Profile }) {
  const critical = profile.rules.filter((r) => r.criticality === "critical");
  const cmds = Object.entries(profile.commands).filter(([, v]) => v);
  return (
    <div className="space-y-6">
      <p className="measure text-[15px] text-ink-2">{profile.summary}</p>
      {profile.stack.length > 0 && <p className="text-[14px]"><span className="text-ink-3">Stack</span> <span className="ml-2">{profile.stack.join(", ")}</span></p>}

      {cmds.length > 0 && (
        <div>
          <h3 className="heading mb-1.5 text-[14px]">How a change is proven</h3>
          <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1 text-[14px]">
            {cmds.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-ink-3">{k}</dt>
                <dd><code className="font-mono text-[13px]">{v}</code></dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div>
        <h3 className="heading mb-1.5 text-[14px]">Company rules <span className="font-normal text-ink-3">({profile.rules.length}, {critical.length} critical)</span></h3>
        {profile.rules.length === 0 ? (
          <p className="text-[14px] text-ink-3">No rules were given. Arrow still keeps workers inside their packet&apos;s files and never weakens a test.</p>
        ) : (
          <ul className="divide-y divide-rule border-y border-rule">
            {profile.rules.map((r) => (
              <li key={r.id} className="flex gap-3 py-2 text-[14px]">
                <span className="w-7 shrink-0 font-mono text-[12px] leading-6 text-ink-3">{r.id}</span>
                <div className="min-w-0 flex-1">
                  <p>{r.text}</p>
                  {r.protectedPaths.length > 0 && (
                    <p className="mt-0.5 text-[13px] text-ink-3">Protects {r.protectedPaths.map((p) => <code key={p} className="mr-1.5 font-mono text-ink-2">{p}</code>)}</p>
                  )}
                </div>
                <span className={`h-fit shrink-0 rounded px-1.5 py-0.5 text-[12px] ${r.criticality === "critical" ? "bg-red-soft text-red" : "text-ink-3"}`}>{r.criticality}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {(profile.toolchain.runtimes.length > 0 || profile.toolchain.packageManager || profile.envVars.length > 0) && (
        <div>
          <h3 className="heading mb-1.5 text-[14px]">What a fresh copy needs</h3>
          <ul className="space-y-1 text-[14px]">
            {profile.toolchain.packageManager && <li><span className="text-ink-3">Install:</span> {profile.commands.setup ?? profile.toolchain.packageManager} {profile.toolchain.lockfile && <span className="text-ink-3">(from {profile.toolchain.lockfile})</span>}</li>}
            {profile.toolchain.runtimes.map((r) => <li key={r.name}><span className="text-ink-3">{r.name}:</span> {r.version}</li>)}
            {profile.envVars.length > 0 && <li><span className="text-ink-3">Needs these variables (names only):</span> {profile.envVars.map((v) => v.name).join(", ")}</li>}
          </ul>
        </div>
      )}

      {profile.adaptations.length > 0 && (
        <div>
          <h3 className="heading mb-1.5 text-[14px]">How Arrow runs in this repo</h3>
          <ul className="space-y-1.5 text-[14px]">
            {profile.adaptations.map((a) => (
              <li key={a.setting}>
                <span className="text-ink-3">{a.setting}:</span> {a.value}
                {a.why && <span className="text-ink-3"> — {a.why}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {profile.structure.length > 0 && (
        <details className="text-[14px]">
          <summary className="cursor-pointer text-ink-2">Folder map ({profile.structure.length})</summary>
          <ul className="mt-2 space-y-0.5">
            {profile.structure.map((s) => (
              <li key={s.path}><code className="font-mono text-[13px]">{s.path}</code> <span className="text-ink-3">{s.purpose}</span></li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ tasks

const stageWords: Record<TaskStage, [string, string]> = {
  pm: ["Project manager writing the spec", "text-blue"],
  questions: ["Waiting on your answers", "text-gold-ink"],
  architect: ["Architect splitting it into packets", "text-blue"],
  plan_gate: ["Waiting on the plan check", "text-gold-ink"],
  building: ["Workers building", "text-blue"],
  landed: ["Landed", "text-green"],
  halted: ["Stopped", "text-red"],
};

export function TaskForm({ pid, enabled, onDone }: { pid: string; enabled: boolean; onDone: (taskId: string) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await act(pid, { type: "submit_task", text });
      setText("");
      onDone(r.taskId!);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={send} className="rounded-lg border border-rule bg-panel p-4">
      <label htmlFor="task" className="heading text-[15px]">Send a task</label>
      <p className="mt-0.5 text-[13px] text-ink-3">
        {enabled ? "Say what you need in plain words. The project manager turns it into a spec; the architect plans it; workers build it." : "Tasks open once the rules check for this repo is approved."}
      </p>
      <textarea
        id="task"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={!enabled}
        rows={3}
        maxLength={8000}
        placeholder="Support should be able to refund part of an order, and the receipt should show it."
        className="mt-3 block w-full rounded-md border border-rule bg-paper px-3 py-2 text-[15px] disabled:opacity-50"
      />
      <div className="mt-3 flex items-center gap-3">
        <button type="submit" disabled={!enabled || busy || text.trim().length < 10} className="rounded-md bg-ink px-4 py-2 text-[14px] font-semibold text-paper disabled:opacity-50">
          {busy ? "Sending…" : "Send task"}
        </button>
        {error && <p className="text-[14px] text-red" role="alert">{error}</p>}
      </div>
    </form>
  );
}

export function TaskList({ pid, state }: { pid: string; state: ProjectState }) {
  const tasks = [...state.taskOrder].reverse().map((t) => state.tasks[t]);
  if (!tasks.length) return <p className="text-[14px] text-ink-3">No tasks yet.</p>;
  return (
    <ul className="divide-y divide-rule border-y border-rule">
      {tasks.map((t) => {
        const [word, color] = stageWords[t.stage];
        const pks = t.order.map((id) => t.packets[id]);
        return (
          <li key={t.taskId}>
            <Link href={`/p/${pid}/t/${t.taskId}`} className="grid grid-cols-[3rem_1fr] gap-x-3 py-3 hover:bg-paper sm:grid-cols-[3rem_1fr_16rem]">
              <span className="font-mono text-[13px] leading-6 text-ink-3">{t.taskId}</span>
              <span className="min-w-0 truncate text-[15px]">{t.spec?.title ?? t.text}</span>
              <span className={`col-start-2 text-[13px] sm:col-start-3 sm:text-right ${color}`}>
                {word}
                {t.stage === "building" && ` — ${pks.filter((p) => p.status === "merged").length} of ${pks.length} landed`}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// ------------------------------------------------------------------ packets

const packetWords: Record<PacketStatus, [string, string]> = {
  waiting: ["Waiting", "text-ink-3"],
  preparing: ["Arrow preparing its copy", "text-blue"],
  prepared: ["Ready for a worker", "text-blue"],
  working: ["Worker on it", "text-blue"],
  built: ["Built, about to be checked", "text-blue"],
  verifying: ["Arrow re-running the checks", "text-blue"],
  verified: ["Proven, queued to merge", "text-blue"],
  merging: ["Merging", "text-blue"],
  merged: ["Landed", "text-green"],
  failed: ["Failed a check", "text-red"],
  parked: ["Paused for you", "text-gold-ink"],
};

export function PacketTable({ task, state }: { task: TaskView; state: ProjectState }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ul className="divide-y divide-rule border-y border-rule">
      {task.order.map((id) => {
        const p = task.packets[id];
        const [word, color] = packetWords[p.status];
        const runs = Object.values(state.jobs).filter((j) => j.subject === `${task.taskId}:${id}:work`).length;
        const expanded = open === id;
        return (
          <li key={id} className="py-3">
            <button type="button" onClick={() => setOpen(expanded ? null : id)} aria-expanded={expanded} className="grid w-full grid-cols-[3rem_1fr] gap-x-3 text-left sm:grid-cols-[3rem_1fr_14rem]">
              <span className="font-mono text-[13px] leading-6 text-ink-3">{id}</span>
              <span className="min-w-0">
                <span className="text-[15px]">{p.packet.title}</span>
                {p.packet.deps.length > 0 && <span className="ml-2 text-[13px] text-ink-3">after {p.packet.deps.join(", ")}</span>}
              </span>
              <span className={`col-start-2 text-[13px] sm:col-start-3 sm:text-right ${color}`}>
                {word}
                <span className="text-ink-3"> — {runs} run{runs === 1 ? "" : "s"}{p.repairs ? `, re-aimed ${p.repairs}×` : ""}</span>
              </span>
            </button>
            {expanded && (
              <div className="ml-0 mt-3 space-y-3 text-[14px] sm:ml-[3.75rem]">
                <p className="measure text-ink-2">{p.packet.objective}</p>
                <div>
                  <p className="text-[13px] text-ink-3">May change</p>
                  <p>{p.packet.files.map((f) => <code key={f} className="mr-2 font-mono text-[13px]">{f}</code>)}</p>
                </div>
                <div>
                  <p className="text-[13px] text-ink-3">Proven by</p>
                  <ul>{p.packet.verification.map((v) => <li key={v}><code className="font-mono text-[13px]">{v}</code></li>)}</ul>
                </div>
                {(p.lastFailure || p.parkedReason) && (
                  <p className="text-red">{p.parkedReason ?? p.lastFailure?.message}</p>
                )}
                {p.report && p.report.length > 0 && (
                  <pre className="max-h-72 overflow-auto rounded-md bg-paper p-3 font-mono text-[12px] leading-relaxed text-ink-2">{p.report.join("\n")}</pre>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ------------------------------------------------------------------ activity + numbers

export function MetricsStrip({ m }: { m: Metrics }) {
  const items: [string, string][] = [
    ["Packets landed", `${m.merged} of ${m.packets}`],
    ["Landed first try", m.merged ? `${Math.round((m.firstPass / m.merged) * 100)}%` : "—"],
    ["Worker runs", String(m.workerRuns)],
    ["Re-aimed by architect", String(m.repairs)],
    ["Provider outages", String(m.providerFailures)],
    ["Agent time", `${m.agentMinutes} min`],
    ["Tokens", m.tokens ? m.tokens.toLocaleString() : "—"],
    ["Cost", [m.cost.bobcoins ? `${m.cost.bobcoins} bobcoins` : "", m.cost.usd ? `$${m.cost.usd.toFixed(2)}` : ""].filter(Boolean).join(" + ") || "—"],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4 lg:grid-cols-7">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-[12px] text-ink-3">{k}</dt>
          <dd className="heading text-[18px]">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const roleWords: Record<JobView["role"], string> = {
  onboarder: "Onboarder", pm: "Project manager", architect: "Architect", worker: "Worker", orchestrator: "Orchestrator", human: "You",
};

export function Activity({ pid, state, taskId }: { pid: string; state: ProjectState; taskId?: string }) {
  const [log, setLog] = useState<{ job: string; text: string } | null>(null);
  const jobs = Object.values(state.jobs)
    .filter((j) => !taskId || j.subject.startsWith(`${taskId}:`))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, 60);

  async function open(job: JobView) {
    if (log?.job === job.jobId) return setLog(null);
    const r = await fetch(`/api/projects/${pid}/log?job=${job.jobId}`, { cache: "no-store" });
    const j = await r.json().catch(() => ({ log: "" }));
    setLog({ job: job.jobId, text: j.log || "No transcript for this step (Arrow ran it itself)." });
  }

  if (!jobs.length) return <p className="text-[14px] text-ink-3">Nothing has run yet.</p>;
  return (
    <ul className="divide-y divide-rule border-y border-rule text-[14px]">
      {jobs.map((j) => (
        <li key={j.jobId}>
          <button type="button" onClick={() => open(j)} className="grid w-full grid-cols-[7.5rem_1fr_auto] gap-x-3 py-2 text-left hover:bg-paper">
            <span className="text-ink-2">{roleWords[j.role]}</span>
            <span className="min-w-0 truncate">
              {labelOf(j.subject)}
              {j.attempt > 1 && <span className="text-ink-3"> (attempt {j.attempt})</span>}
              {j.failure && <span className="text-red"> — {j.failure.message}</span>}
            </span>
            <span className="flex justify-end gap-3 text-[13px] text-ink-3">
              <span className={!j.finishedAt ? "text-blue" : j.ok ? "" : "text-red"}>
                {!j.finishedAt ? "running" : j.ok ? "done" : j.failure?.class === "provider" ? "outage" : "failed"}
              </span>
              {j.durationMs !== undefined && <span className="w-12 text-right">{duration(j.durationMs)}</span>}
              <span className="hidden w-16 text-right sm:inline">{ago(j.startedAt)}</span>
            </span>
          </button>
          {log?.job === j.jobId && (
            <pre className="mb-2 max-h-80 overflow-auto rounded-md bg-paper p-3 font-mono text-[12px] leading-relaxed text-ink-2">{log.text}</pre>
          )}
        </li>
      ))}
    </ul>
  );
}
