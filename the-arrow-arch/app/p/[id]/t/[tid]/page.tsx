"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { NeedsYou } from "@/components/decisions";
import { FinalReportCard } from "@/components/final-report";
import { FlightBand, FlightPath } from "@/components/flight-path";
import { NowStrip } from "@/components/now-strip";
import { Section } from "@/components/panels";
import { TaskNumbersCard } from "@/components/task-numbers";
import { TaskTree } from "@/components/task-tree";
import { usePoll, type Payload } from "@/lib/client";
import { flightOf } from "@/lib/flight";
import { acceptanceCounts } from "@/lib/tree";

export default function TaskPage() {
  const { id, tid } = useParams<{ id: string; tid: string }>();
  const { data, error, reload } = usePoll<Payload>(`/api/projects/${id}`);
  if (error && !data) return <p className="text-accent-ink">{error}</p>;
  if (!data) return <p className="text-ink-3">Loading…</p>;
  const s = data.state;
  const t = s.tasks[tid];
  if (!t) return <p className="text-accent-ink">There is no task {tid} in this repo.</p>;
  const forYou = t.spec && t.acceptance ? t.spec.acceptance.filter((a) => t.acceptance!.report.some((l) => l.startsWith(`YOU   ${a.id} `))) : [];
  const ran = t.acceptance ? acceptanceCounts(t.acceptance.report).ran : 0;

  return (
    <div>
      <Link href={`/p/${id}`} className="text-[13px] text-ink-2 underline decoration-rule-strong underline-offset-4 hover:text-ink">
        {s.name}
      </Link>
      <h1 className="display mt-2 text-[30px] sm:text-[40px]">{t.spec?.title ?? t.text}</h1>
      <p className="measure mt-2 text-[14px] text-ink-3">{tid}, sent as: “{t.text}”</p>

      <FlightBand>
        <FlightPath flight={flightOf(s, t)} />
      </FlightBand>

      {t.report && <FinalReportCard t={t} preview={data.preview} repoPath={s.repo?.path} setup={s.profile?.commands.setup} />}

      {data.numbers[tid] && (
        <div className="mt-4">
          <TaskNumbersCard n={data.numbers[tid]} />
        </div>
      )}

      {t.haltedReason && <p className="mt-6 rounded-sm bg-well px-4 py-3 text-[14px]">Stopped: {t.haltedReason}</p>}
      {t.landed && (
        <div className="mt-6 rounded-lg border border-rule border-l-[3px] border-l-ink bg-white px-5 py-4">
          <h2 className="heading text-[18px]">Landed on <code className="font-mono">{t.landed.branch}</code></h2>
          <p className="mt-1 text-[14px] text-ink-2">
            Every packet was proven by its own checks, re-run by Arrow, and merged one at a time. <code className="font-mono">arrow/main</code> holds every landed task in order, so the next task builds on this one. Nothing was pushed — review it, then open a pull request when you&apos;re happy.
          </p>
          {forYou.length > 0 && (
            <div className="mt-3 rounded-sm bg-accent-soft px-4 py-3 text-[14px]">
              <p className="heading text-accent-ink">
                {ran ? `Arrow ran ${ran} of the spec's checks and they passed. These ${forYou.length} it couldn't run — they're for you:` : `Arrow could run none of the spec's checks. All ${forYou.length} are for you:`}
              </p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-ink-2">
                {forYou.map((a) => <li key={a.id}><span className="font-mono text-[12px] text-ink-3">{a.id}</span> {a.statement}</li>)}
              </ul>
            </div>
          )}
          <pre className="mt-3 overflow-auto rounded-sm bg-well p-3 font-mono text-[12px] text-ink-2">
            {`cd ${s.repo?.path}\ngit log --oneline ${s.repo?.branch}..arrow/main   # everything Arrow landed\ngit diff ${s.repo?.branch}...${t.landed.branch}      # up to and including this task`}
          </pre>
        </div>
      )}

      <div id="needs" className="mt-6 scroll-mt-6">
        <NeedsYou pid={id} state={s} taskId={tid} onDone={reload} />
      </div>

      {Object.values(s.jobs).some((j) => !j.finishedAt && j.subject.startsWith(`${tid}:`)) && (
        <Section title="Running now" aside="the last thing each agent did">
          <NowStrip s={s} now={data.now} taskId={tid} />
        </Section>
      )}

      <Section title="The whole task" aside="open any line: every prompt, run and check is kept">
        <TaskTree pid={id} s={s} t={t} now={data.now} onDone={reload} />
      </Section>
    </div>
  );
}
