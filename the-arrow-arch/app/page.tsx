"use client";

import Link from "next/link";
import type { ProjectStage } from "@/engine/types";
import { ago, usePoll } from "@/lib/client";

type Row = { id: string; name: string; repoUrl: string; stage: ProjectStage; updatedAt: string; tasks: number; activeTasks: number; needs: number };

const stageWords: Record<ProjectStage, string> = {
  cloning: "Copying the repo",
  onboarding: "Onboarding",
  onboarding_gate: "Rules check waiting",
  ready: "Ready for tasks",
  stopped: "Stopped at onboarding",
};

export default function Home() {
  const { data, error } = usePoll<{ projects: Row[] }>("/api/projects", 2500);
  const projects = data?.projects ?? [];

  return (
    <div>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="display text-[40px] sm:text-[52px]">Aim once. Land once.</h1>
          <p className="measure mt-3 text-[16px] text-ink-2">
            Give Arrow a repository and the rules your team codes by. Then send tasks in plain words: a project manager
            writes the spec, an architect splits it, workers build in parallel, and nothing lands until Arrow has
            re-run the proof itself.
          </p>
        </div>
        <Link href="/onboard" className="shrink-0 self-start rounded-md bg-ink px-5 py-2.5 text-[15px] font-semibold text-paper sm:self-auto">
          Onboard a repository
        </Link>
      </div>

      <div className="mt-12">
        <h2 className="heading mb-3 border-b border-rule pb-2 text-[18px]">Repositories</h2>
        {error && <p className="text-[14px] text-red">{error}</p>}
        {data && projects.length === 0 && (
          <div className="rounded-lg border border-dashed border-rule-strong px-6 py-10">
            <p className="heading text-[17px]">No repositories yet</p>
            <p className="measure mt-1 text-[14px] text-ink-2">
              Start with one: paste a GitHub URL or a local path, add your team&apos;s rules, and Arrow will learn the repo and
              check it against them.
            </p>
            <Link href="/onboard" className="mt-4 inline-block rounded-md border border-ink px-4 py-2 text-[14px] font-semibold">
              Onboard a repository
            </Link>
          </div>
        )}
        <ul className="divide-y divide-rule">
          {projects.map((p) => (
            <li key={p.id}>
              <Link href={`/p/${p.id}`} className="grid grid-cols-1 gap-1 py-4 hover:bg-panel sm:grid-cols-[1fr_12rem_9rem] sm:items-baseline sm:gap-4 sm:px-2">
                <span>
                  <span className="heading block text-[17px]">{p.name}</span>
                  <span className="block truncate font-mono text-[12px] text-ink-3">{p.repoUrl}</span>
                </span>
                <span className="text-[14px] text-ink-2">
                  {p.needs > 0 ? <span className="text-gold-ink">{p.needs} waiting on you</span> : stageWords[p.stage]}
                  {p.tasks > 0 && <span className="block text-[13px] text-ink-3">{p.activeTasks} active of {p.tasks} task{p.tasks === 1 ? "" : "s"}</span>}
                </span>
                <span className="text-[13px] text-ink-3 sm:text-right">{ago(p.updatedAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
