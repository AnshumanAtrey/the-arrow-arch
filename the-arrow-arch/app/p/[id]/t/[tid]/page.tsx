"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { NeedsYou } from "@/components/decisions";
import { FlightPath } from "@/components/flight-path";
import { GateCard } from "@/components/gate-card";
import { Activity, PacketTable, Section } from "@/components/panels";
import { TaskNumbersCard } from "@/components/task-numbers";
import { usePoll, type Payload } from "@/lib/client";
import { flightOf } from "@/lib/flight";

const methodWords = {
  one_shot: "One shot — plan once, build in parallel, prove, land.",
  phased: "In phases — each phase lands and is proven before the next is planned.",
  iterative: "Iterative — land the smallest useful slice first, then continue.",
} as const;

export default function TaskPage() {
  const { id, tid } = useParams<{ id: string; tid: string }>();
  const { data, error, reload } = usePoll<Payload>(`/api/projects/${id}`);
  if (error && !data) return <p className="text-red">{error}</p>;
  if (!data) return <p className="text-ink-3">Loading…</p>;
  const s = data.state;
  const t = s.tasks[tid];
  if (!t) return <p className="text-red">There is no task {tid} in this repo.</p>;
  const gate = t.planGateId ? s.gates[t.planGateId] : undefined;

  return (
    <div>
      <Link href={`/p/${id}`} className="text-[13px] text-ink-2 underline decoration-rule-strong underline-offset-4 hover:text-ink">
        {s.name}
      </Link>
      <h1 className="display mt-2 text-[30px] sm:text-[40px]">{t.spec?.title ?? t.text}</h1>
      <p className="measure mt-2 text-[14px] text-ink-3">{tid}, sent as: “{t.text}”</p>

      <div className="mt-8 rounded-lg border border-rule bg-panel px-3 py-5 sm:px-6">
        <FlightPath flight={flightOf(s, t)} />
      </div>

      {data.numbers[tid] && (
        <div className="mt-4">
          <TaskNumbersCard n={data.numbers[tid]} />
        </div>
      )}

      {t.haltedReason && <p className="mt-6 rounded-md bg-red-soft px-4 py-3 text-[14px]">Stopped: {t.haltedReason}</p>}
      {t.landed && (
        <div className="mt-6 rounded-lg border border-rule border-l-[5px] border-l-green bg-panel px-5 py-4">
          <h2 className="heading text-[18px]">Landed on <code className="font-mono">{t.landed.branch}</code></h2>
          <p className="mt-1 text-[14px] text-ink-2">
            Every packet was proven by Arrow and merged one at a time. <code className="font-mono">arrow/main</code> holds every landed task in order, so the next task builds on this one. Nothing was pushed — review it, then open a pull request when you&apos;re happy.
          </p>
          <pre className="mt-3 overflow-auto rounded-md bg-paper p-3 font-mono text-[12px] text-ink-2">
            {`cd ${s.repo?.path}\ngit log --oneline ${s.repo?.branch}..arrow/main   # everything Arrow landed\ngit diff ${s.repo?.branch}...${t.landed.branch}      # up to and including this task`}
          </pre>
        </div>
      )}

      <div className="mt-6">
        <NeedsYou pid={id} state={s} taskId={tid} onDone={reload} />
      </div>

      <div className="grid gap-x-10 lg:grid-cols-2">
        <Section title="Spec" aside="from the project manager">
          {t.spec ? (
            <div className="space-y-4 text-[14px]">
              <p className="measure text-[15px] text-ink-2">{t.spec.intent}</p>
              <p><span className="text-ink-3">How it runs:</span> {methodWords[t.spec.methodology.mode]} <span className="text-ink-3">{t.spec.methodology.why}</span></p>
              <div>
                <h3 className="heading mb-1.5 text-[14px]">Done means</h3>
                <ul className="divide-y divide-rule border-y border-rule">
                  {t.spec.acceptance.map((a) => (
                    <li key={a.id} className="py-2">
                      <p>{a.statement}</p>
                      <p className="text-[13px] text-ink-3">Checked by <code className="font-mono">{a.check}</code></p>
                    </li>
                  ))}
                </ul>
              </div>
              {t.spec.outOfScope.length > 0 && <p><span className="text-ink-3">Not doing:</span> {t.spec.outOfScope.join("; ")}</p>}
              {t.answers && (
                <div>
                  <h3 className="heading mb-1 text-[14px]">Your answers</h3>
                  {t.spec.questions.map((q) => (
                    <p key={q.id}><span className="text-ink-3">{q.question}</span> {t.answers![q.id]}</p>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-[14px] text-ink-3">The project manager is writing it.</p>
          )}
        </Section>

        <Section title="Plan" aside={t.plan ? `${t.plan.packets.length} packets, on ${t.branch}` : "from the architect"}>
          {t.plan ? (
            <div className="space-y-4">
              <p className="measure text-[14px] text-ink-2">{t.plan.summary}</p>
              <PacketTable task={t} state={s} />
              {gate?.decision && <GateCard pid={id} gate={gate} onDone={reload} />}
            </div>
          ) : (
            <p className="text-[14px] text-ink-3">{t.spec ? "The architect is splitting the work into packets." : "Planning starts once the spec is ready."}</p>
          )}
        </Section>
      </div>

      <Section title="Activity" aside="this task only">
        <Activity pid={id} state={s} taskId={tid} />
      </Section>
    </div>
  );
}
