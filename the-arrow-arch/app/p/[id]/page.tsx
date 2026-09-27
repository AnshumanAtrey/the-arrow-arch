"use client";

import { useParams, useRouter } from "next/navigation";
import { NeedsYou } from "@/components/decisions";
import { FlightBand, FlightPath } from "@/components/flight-path";
import { HousePanel } from "@/components/house-panel";
import { LedgerPanel } from "@/components/ledger-panel";
import { NowStrip } from "@/components/now-strip";
import { PromptBlock } from "@/components/prompt-block";
import { Activity, MetricsStrip, ProfilePanel, TaskForm, TaskList } from "@/components/panels";
import { TabBar, TabPanel, useTab } from "@/components/tabs";
import { usePoll, type Payload } from "@/lib/client";
import { flightOf } from "@/lib/flight";

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, error, reload } = usePoll<Payload>(`/api/projects/${id}`);
  const [tab, setTab] = useTab(["tasks", "live", "learned", "house", "numbers"], "tasks");
  if (error && !data) return <p className="text-accent-ink">{error}</p>;
  if (!data) return <p className="text-ink-3">Loading…</p>;
  const { state: s, metrics, ledger, house } = data;

  // the flight path follows the newest task still in the air, else the newest one
  const live = [...s.taskOrder].reverse().map((t) => s.tasks[t]);
  const focus = live.find((t) => t.stage !== "landed" && t.stage !== "halted") ?? live[0];
  const flight = flightOf(s, s.stage === "ready" ? focus : undefined);

  const running = Object.values(s.jobs).filter((j) => !j.finishedAt).length;

  return (
    <div>
      {focus && <PromptBlock taskId={focus.taskId} text={focus.text} href={`/p/${id}/t/${focus.taskId}`} />}
      <div className={`${focus ? "mt-6" : ""} flex flex-wrap items-baseline justify-between gap-x-6`}>
        <h1 className="display break-words text-[34px] sm:text-[44px]">{s.name}</h1>
        {s.repo && <p className="font-mono text-[12px] text-ink-3">{s.repo.branch} @ {s.repo.head.slice(0, 7)}</p>}
      </div>
      <p className="mt-1 truncate font-mono text-[12px] text-ink-3" title={s.repoUrl}>{s.repoUrl}</p>

      <FlightBand caption={focus && s.stage === "ready" ? <><span className="font-mono text-ink-2">{focus.taskId}</span> {focus.spec?.title ?? "The project manager is writing the spec"}</> : undefined}>
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

      <div className="mt-10">
        <TabBar
          label="This repository"
          current={tab}
          onChange={setTab}
          tabs={[
            { id: "tasks", label: "Tasks", count: s.taskOrder.length },
            { id: "live", label: "Live", count: running || undefined },
            { id: "learned", label: "What Arrow learned", count: s.profile?.rules.length },
            { id: "house", label: "House rules" },
            { id: "numbers", label: "Numbers" },
          ]}
        />
        <TabPanel id="tasks" current={tab}>
          <TaskForm pid={id} enabled={s.stage === "ready"} onDone={(t) => router.push(`/p/${id}/t/${t}`)} />
          <div className="mt-6">
            <TaskList pid={id} state={s} />
          </div>
        </TabPanel>
        <TabPanel id="live" current={tab}>
          <Sub title="Running now">
            <NowStrip s={s} now={data.now} />
          </Sub>
          <Sub title="Activity" aside="every step; open an agent's run for its prompt and what it did">
            <Activity pid={id} state={s} now={data.now} />
          </Sub>
          <Sub title="The shared ledger" aside="worktrees, local servers, what was cleaned up">
            <LedgerPanel ledger={ledger} state={s} />
          </Sub>
        </TabPanel>
        <TabPanel id="learned" current={tab}>
          {s.profile ? (
            <ProfilePanel profile={s.profile} />
          ) : (
            <p className="text-[14px] text-ink-3">{s.repo ? "The onboarder is reading the repo." : "Copying the repository."}</p>
          )}
        </TabPanel>
        <TabPanel id="house" current={tab}>
          {house ? <HousePanel pid={id} state={s} house={house} onDone={reload} /> : <p className="text-[14px] text-ink-3">House rules are tuned once onboarding finishes.</p>}
        </TabPanel>
        <TabPanel id="numbers" current={tab}>
          <MetricsStrip m={metrics} />
          <p className="mt-4 text-[13px] text-ink-3">Computed from the event log, never from a counter.</p>
        </TabPanel>
      </div>
    </div>
  );
}

/** A block inside a tab: a small heading, then its content, full width. */
function Sub({ title, aside, children }: { title: string; aside?: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4">
        <h2 className="heading text-[15px]">{title}</h2>
        {aside && <p className="text-[13px] text-ink-3">{aside}</p>}
      </div>
      {children}
    </section>
  );
}
