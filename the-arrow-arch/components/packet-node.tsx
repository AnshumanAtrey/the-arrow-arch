"use client";

import type { Packet, PacketStatus, ProjectState, TaskView } from "@/engine/types";
import { duration } from "@/lib/client";
import { depsOf, packetRows, type Row } from "@/lib/tree";
import { AgentRun } from "./agent-run";
import { Body, Leaf, Node, Pre, type Mark } from "./tree";

const stateOf: Record<PacketStatus, [string, Mark]> = {
  waiting: ["Queued", "idle"],
  preparing: ["Arrow preparing its copy", "run"],
  prepared: ["Ready for a worker", "run"],
  working: ["Worker on it", "run"],
  built: ["Built, about to be checked", "run"],
  verifying: ["Arrow re-running the checks", "run"],
  verified: ["Proven, queued to merge", "run"],
  merging: ["Merging", "run"],
  merged: ["Landed", "done"],
  failed: ["Missed a check, being handled", "run"],
  parked: ["Paused for you", "you"],
};

const originWords = { reaim: (from?: string) => `split off ${from ?? "a packet"} by a re-aim`, completion: () => "added to close the gap to the spec", phase: () => "" };

/** A packet: what the architect told its worker, what it waits on, and every run, check and re-aim in order. */
export function PacketNode({ pid, s, t, id, now }: { pid: string; s: ProjectState; t: TaskView; id: string; now: Record<string, string> }) {
  const p = t.packets[id];
  const { waitingFor, unblocks } = depsOf(t, id);
  const [word, mark] = p.status === "waiting" && waitingFor.length ? [`Waiting for ${waitingFor.join(", ")} to land`, "idle" as Mark] : stateOf[p.status];
  const rows = packetRows(s, t, id);
  const runs = rows.filter((r) => r.kind === "run").length;
  const origin = p.origin && p.origin.by !== "phase" ? originWords[p.origin.by](p.origin.from) : "";
  let run = 0;

  return (
    <Node
      open={mark === "you" || (mark === "run" && p.status !== "failed")}
      mark={mark}
      meta={`${word}${runs ? ` · ${runs} run${runs === 1 ? "" : "s"}` : ""}${p.repairs ? ` · re-aimed ${p.repairs}×` : ""}`}
      title={
        <>
          <code className="mr-2 font-mono text-[13px] text-ink-3">{id}</code>
          {p.packet.title}
          {(origin || p.packet.deps.length > 0) && (
            <span className="block text-[13px] text-ink-3">
              {[origin, p.packet.deps.length ? `after ${p.packet.deps.join(", ")}` : ""].filter(Boolean).join(" · ")}
            </span>
          )}
          <span className={`block text-[13px] sm:hidden ${mark === "you" ? "text-accent-ink" : "text-ink-3"}`}>{word}</span>
        </>
      }
    >
      <Node open title={<>What the architect told the worker</>}>
        <Brief packet={p.packet} />
        <Body>
          {p.packet.deps.length > 0 && (
            <p><span className="text-ink-3">Starts after </span>{p.packet.deps.map((d) => `${d} (${t.packets[d]?.status === "merged" ? "landed" : "not landed yet"})`).join(", ")}</p>
          )}
          {unblocks.length > 0 && <p><span className="text-ink-3">Waiting on this one: </span>{unblocks.join(", ")}</p>}
          {p.origin && <p className="text-ink-3">Why it exists: {p.origin.reason}</p>}
        </Body>
      </Node>
      {rows.map((r, i) => (
        <RowView key={i} r={r} pid={pid} t={t} now={now} n={r.kind === "run" ? ++run : 0} />
      ))}
    </Node>
  );
}

function Brief({ packet }: { packet: Packet }) {
  const list = (label: string, xs: string[]) =>
    xs.length > 0 && (
      <div>
        <p className="text-[13px] text-ink-3">{label}</p>
        <ul>{xs.map((x) => <li key={x}><code className="break-all font-mono text-[13px]">{x}</code></li>)}</ul>
      </div>
    );
  return (
    <Body>
      <p className="measure">{packet.objective}</p>
      {packet.context && <p className="measure whitespace-pre-wrap text-ink-2">{packet.context}</p>}
      {list("May change", packet.files)}
      {list("Proven by (Arrow runs these itself)", packet.verification)}
      {list("Also run, reported but not blocking", packet.regression)}
      {list("New libraries", packet.newDependencies)}
      {list("Variables it needs (names only)", packet.env)}
      <p className="text-[13px] text-ink-3">{packet.kind === "refactor" ? "Refactor: behaviour stays the same" : "Change"}, {packet.risk} risk</p>
    </Body>
  );
}

function RowView({ r, pid, t, now, n }: { r: Row; pid: string; t: TaskView; now: Record<string, string>; n: number }) {
  switch (r.kind) {
    case "run":
      return <AgentRun pid={pid} job={r.job} title={r.job.role === "worker" ? `Worker, run ${n}` : "Architect re-aiming it"} live={now[r.job.jobId]} />;
    case "prepare":
      return (
        <Leaf mark={r.job.finishedAt ? "done" : "run"} meta={duration(r.job.durationMs)}>
          <span className="text-[14px] text-ink-2">Arrow made the packet its own copy of the repo{r.job.ok === false ? ` — failed: ${r.job.failure?.message}` : ""}</span>
        </Leaf>
      );
    case "check":
      return (
        <Node mark="done" title={r.ok ? "Arrow re-ran the proof: passed" : <>Arrow&apos;s check failed <span className="text-ink-2">— {r.failure?.message}</span></>}>
          {r.report.length ? <Pre>{r.report.join("\n")}</Pre> : <p className="py-1 text-[14px] text-ink-3">No command output — the check itself explains it above.</p>}
        </Node>
      );
    case "reaim":
      return (
        <Node mark="done" title={<>Re-aimed by the architect <span className="text-ink-2">— after: {r.note}</span></>}>
          <Body>
            {r.moved.length > 0 && <p>What it took out became {r.moved.join(", ")} — work is moved, never dropped.</p>}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-[13px] text-ink-3">Before</p>
                <p>{r.before.objective}</p>
                <p className="mt-1 break-all font-mono text-[12px] text-ink-3">{r.before.files.join("  ")}</p>
              </div>
              <div>
                <p className="text-[13px] text-ink-3">After</p>
                <p>{r.after.objective}</p>
                <p className="mt-1 break-all font-mono text-[12px] text-ink-3">{r.after.files.join("  ")}</p>
              </div>
            </div>
          </Body>
          {r.job && <AgentRun pid={pid} job={r.job} title="The re-aim run" />}
        </Node>
      );
    case "merged":
      return <Leaf mark="done"><span className="text-[14px]">Merged into <code className="font-mono">{t.branch}</code> at <code className="font-mono">{r.head.slice(0, 7)}</code></span></Leaf>;
    case "parked":
      return r.current ? (
        <Leaf mark="you"><span className="text-[14px] text-accent-ink">Paused for you: {r.reason} <a href="#needs" className="underline underline-offset-4">Answer it above</a></span></Leaf>
      ) : (
        <Leaf mark="done"><span className="text-[14px] text-ink-2">Paused for you: {r.reason}</span></Leaf>
      );
    case "retried":
      return <Leaf mark="done"><span className="text-[14px] text-ink-2">You told it to try again</span></Leaf>;
    default:
      return null;
  }
}
