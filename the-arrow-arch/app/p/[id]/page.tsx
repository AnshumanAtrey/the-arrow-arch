"use client";

import { useParams, useRouter } from "next/navigation";
import { NeedsYou } from "@/components/decisions";
import { FlightBand, FlightPath } from "@/components/flight-path";
import { HousePanel } from "@/components/house-panel";
import { LedgerPanel } from "@/components/ledger-panel";
import { NowStrip } from "@/components/now-strip";
import { Activity, MetricsStrip, ProfilePanel, Section, TaskForm, TaskList } from "@/components/panels";
import { usePoll, type Payload } from "@/lib/client";
import { flightOf } from "@/lib/flight";

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, error, reload } = usePoll<Payload>(`/api/projects/${id}`);
  if (error && !data) return <p className="text-accent-ink">{error}</p>;
  if (!data) return <p className="text-ink-3">Loading…</p>;
  const { state: s, metrics, ledger, house } = data;

  // the flight path follows the newest task still in the air, else the newest one
  const live = [...s.taskOrder].reverse().map((t) => s.tasks[t]);
  const focus = live.find((t) => t.stage !== "landed" && t.stage !== "halted") ?? live[0];
  const flight = flightOf(s, s.stage === "ready" ? focus : undefined);

  return (
    <div>
      <p className="text-[13px] text-ink-3">
        <span className="font-mono">{s.repoUrl}</span>
        {s.repo && <span className="ml-3 font-mono">{s.repo.branch} @ {s.repo.head.slice(0, 7)}</span>}
      </p>
      <h1 className="display mt-1 break-words text-[34px] sm:text-[46px]">{s.name}</h1>

      <FlightBand caption={focus && s.stage === "ready" ? <><span className="font-mono text-ink-2">{focus.taskId}</span> {focus.spec?.title ?? focus.text}</> : undefined}>
        <FlightPath flight={flight} />
      </FlightBand>

      {s.frozen && (
        <p className="mt-6 rounded-sm bg-well px-4 py-3 text-[14px]">
          Code freeze is on{s.frozen.reason ? `: ${s.frozen.reason}` : ""}. No worker starts and nothing lands until you lift it.
        </p>
      )}
      {s.stage === "stopped" && (
        <p className="mt-6 rounded-sm bg-well px-4 py-3 text-[14px]">
          You stopped this repo at the rules check. Fix what it flagged, then onboard it again.
        </p>
      )}

      <div id="needs" className="mt-6 scroll-mt-6">
        <NeedsYou pid={id} state={s} onDone={reload} />
      </div>

      <div className="grid gap-x-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div>
          <Section title="Tasks" aside={s.taskOrder.length ? `${s.taskOrder.length} sent` : undefined}>
            <TaskForm pid={id} enabled={s.stage === "ready"} onDone={(t) => router.push(`/p/${id}/t/${t}`)} />
            <div className="mt-4">
              <TaskList pid={id} state={s} />
            </div>
          </Section>
          <Section title="Right now" aside="who is running, and the shared ledger">
            <NowStrip s={s} now={data.now} />
            <div className="mt-6">
              <LedgerPanel ledger={ledger} state={s} />
            </div>
          </Section>
          <Section title="Activity" aside="every step; open an agent's run for its prompt">
            <Activity pid={id} state={s} now={data.now} />
          </Section>
        </div>
        <div>
          <Section title="What Arrow learned">
            {s.profile ? (
              <ProfilePanel profile={s.profile} />
            ) : (
              <p className="text-[14px] text-ink-3">{s.repo ? "The onboarder is reading the repo." : "Copying the repository."}</p>
            )}
          </Section>
          {house && (
            <Section title="House rules" aside="Arrow's defaults, tuned by onboarding">
              <HousePanel pid={id} state={s} house={house} onDone={reload} />
            </Section>
          )}
        </div>
      </div>

      <Section title="Numbers" aside="computed from the event log, never from a counter">
        <MetricsStrip m={metrics} />
      </Section>
    </div>
  );
}
