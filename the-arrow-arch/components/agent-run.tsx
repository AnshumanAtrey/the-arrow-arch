"use client";

import { useEffect, useState } from "react";
import type { Step, Transcript } from "@/engine/transcript";
import type { JobView } from "@/engine/types";
import { duration } from "@/lib/client";
import { Leaf, Node, Pre, tokens } from "./tree";

/**
 * One agent run. Opening it reads the run's log: the exact prompt it was given,
 * cut at its sections, then every step it took. A run still going refreshes
 * while it is open.
 */
export function AgentRun({ pid, job, title, live, open = false }: { pid: string; job: JobView; title: string; live?: string; open?: boolean }) {
  const [shown, setShown] = useState(open);
  const [t, setT] = useState<Transcript | null | undefined>(undefined);
  const running = !job.finishedAt;

  useEffect(() => {
    if (!shown) return;
    let gone = false;
    const load = async () => {
      const r = await fetch(`/api/projects/${pid}/log?job=${job.jobId}`, { cache: "no-store" }).catch(() => null);
      const j = await r?.json().catch(() => null);
      if (!gone) setT(j?.transcript ?? null);
    };
    void load();
    const iv = running ? setInterval(load, 3000) : undefined;
    return () => {
      gone = true;
      clearInterval(iv);
    };
  }, [shown, running, pid, job.jobId]);

  const meta = [job.driver, running ? "running" : duration(job.durationMs), tokens(job.tokens?.total), job.cost ? (job.costUnit === "bobcoins" ? `${job.cost} bobcoins` : `$${job.cost.toFixed(2)}`) : ""].filter(Boolean).join(" · ");
  return (
    <Node
      open={open}
      onOpen={() => setShown(true)}
      mark={running ? "run" : "done"}
      meta={meta}
      title={
        <>
          {title}
          {running && live && <span className="block truncate font-mono text-[12px] text-ink-3">{live}</span>}
          {!running && job.ok === false && job.failure && <span className="block text-[13px] text-ink-2">Didn&apos;t finish: {job.failure.message}</span>}
        </>
      }
    >
      {t === undefined ? (
        <p className="py-1 text-[14px] text-ink-3">Reading the log…</p>
      ) : t === null ? (
        <p className="py-1 text-[14px] text-ink-3">There is no log for this run.</p>
      ) : (
        <>
          <p className="break-all py-1 font-mono text-[12px] text-ink-3">{t.command}</p>
          <Node title={<>Prompt <span className="text-ink-3">— exactly what it was told</span></>} meta={`${t.prompt.length.toLocaleString()} characters`}>
            {t.sections.length ? (
              t.sections.map((sec, i) => (
                <Node key={i} title={sec.title || "Opening"} open={/who else|inputs/i.test(sec.title)}>
                  <Pre>{sec.body}</Pre>
                </Node>
              ))
            ) : (
              <Pre>{t.prompt || "The prompt wasn't recorded for this run."}</Pre>
            )}
          </Node>
          <Node open title={<>What it did <span className="text-ink-3">— {t.steps.filter((x) => x.kind === "tool").length} tool calls</span></>}>
            {t.steps.length ? t.steps.map((st, i) => <StepRow key={i} st={st} />) : <p className="py-1 text-[14px] text-ink-3">Nothing yet.</p>}
          </Node>
        </>
      )}
    </Node>
  );
}

function StepRow({ st }: { st: Step }) {
  if (st.kind === "tool") {
    const line = (
      <>
        <code className="font-mono text-[13px]">{st.tool}</code> <span className="break-all text-[14px] text-ink-2">{st.detail}</span>
      </>
    );
    const meta = st.ok === false ? "error" : undefined;
    return st.output ? (
      <Node title={line} meta={meta}>
        <Pre>{st.output}</Pre>
      </Node>
    ) : (
      <Leaf meta={meta}>{line}</Leaf>
    );
  }
  if (st.kind === "text") return <Leaf><span className="whitespace-pre-wrap text-[14px] text-ink-2">{st.text}</span></Leaf>;
  if (st.kind === "note") return <Leaf><span className="break-all font-mono text-[12px] text-ink-3">{st.text}</span></Leaf>;
  return (
    <Leaf mark="done">
      <span className="text-[14px]">{st.ok ? "Finished" : "Ended with an error"}</span>
      {st.text && <span className="mt-0.5 block whitespace-pre-wrap text-[14px] text-ink-2">{st.text}</span>}
    </Leaf>
  );
}
