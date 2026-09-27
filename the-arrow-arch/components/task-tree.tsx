"use client";

import type { ProjectState, TaskView } from "@/engine/types";
import { acceptanceCounts, phasesOf, taskRows, type Row } from "@/lib/tree";
import { AgentRun } from "./agent-run";
import { GateCard } from "./gate-card";
import { PacketNode } from "./packet-node";
import { Body, Leaf, Node, Pre, type Mark } from "./tree";

const methodWords = {
  one_shot: "One shot: plan once, build in parallel, prove, land.",
  phased: "In phases: each phase lands and you look at it before the next is planned.",
  iterative: "Iterative: land the smallest useful slice first, then continue.",
} as const;

/**
 * The whole task as a tree: the project manager's spec, the architect's plan,
 * every packet with what its worker was told and how each run went, the check
 * against the spec, and the landing. Every line opens; any number stay open.
 */
export function TaskTree({ pid, s, t, now, onDone }: { pid: string; s: ProjectState; t: TaskView; now: Record<string, string>; onDone: () => void }) {
  const parkedHere = (part: string) => Object.keys(s.parked).some((k) => k === `${t.taskId}:${part}`);
  const running = (part: string) => Object.values(s.jobs).some((j) => !j.finishedAt && j.subject === `${t.taskId}:${part}`);
  const pmMark: Mark = parkedHere("pm") || t.stage === "questions" ? "you" : t.stage === "pm" ? "run" : "done";
  const archMark: Mark = parkedHere("architect") || t.stage === "plan_gate" ? "you" : t.stage === "architect" ? "run" : t.plan ? "done" : "idle";
  const acc = t.acceptance;
  const counts = acc ? acceptanceCounts(acc.report) : undefined;
  // checks only a person can do are waiting on a person, even once the task has landed
  const accMark: Mark = parkedHere("accept") || (acc?.ok && counts!.forYou > 0) ? "you" : running("accept") || running("complete") ? "run" : acc?.ok ? "done" : "idle";
  const phases = phasesOf(s, t);
  const phased = phases.length > 1 || (t.plan?.nextPhases.length ?? 0) > 0;
  const planGate = t.planGateId ? s.gates[t.planGateId] : undefined;

  return (
    <div className="text-[15px]">
      <Node open={pmMark !== "done"} mark={pmMark} title={<><span className="heading">Project manager</span> <span className="text-ink-2">{t.spec ? `— spec: ${t.spec.title}` : "— writing the spec"}</span></>}>
        {t.spec && <SpecBody t={t} />}
        <Rows pid={pid} t={t} now={now} rows={taskRows(s, t, "pm")} title="Wrote the spec" />
      </Node>

      <Node
        open={["architect", "plan_gate", "building"].includes(t.stage)}
        mark={archMark}
        title={<><span className="heading">Architect</span> <span className="text-ink-2">{t.plan ? `— ${t.order.length} packet${t.order.length === 1 ? "" : "s"}${phased ? `, phase ${t.phase}${t.plan.nextPhases.length ? ` of ${t.phase + t.plan.nextPhases.length}` : ""}` : ""}` : t.spec ? "— splitting the work into packets" : ""}</span></>}
      >
        {t.plan && <Body><p className="measure text-ink-2">{t.plan.summary}</p></Body>}
        <Rows pid={pid} t={t} now={now} rows={taskRows(s, t, "architect")} title="Planned the packets" />
        {planGate && !planGate.decision && <YouLeaf>The plan check is waiting on you.</YouLeaf>}
        {planGate?.decision && (
          <Node mark="done" title={`Plan check: ${planGate.verdict === "green" ? "all green" : "a critical rule at stake"}, ${planGate.decision === "approve" ? "approved by you" : planGate.decision === "stop" ? "stopped by you" : "sent back by you"}`}>
            <GateCard pid={pid} gate={planGate} onDone={onDone} />
          </Node>
        )}
        {phased
          ? phases.map((ph) => (
              <Node key={ph.number} open={ph.number === t.phase} mark={ph.number < t.phase || t.stage === "landed" ? "done" : "run"} title={<span className="heading">Phase {ph.number}</span>} meta={`${ph.packets.length} packet${ph.packets.length === 1 ? "" : "s"}`}>
                {ph.planner && <AgentRun pid={pid} job={ph.planner} title={`Architect planned phase ${ph.number}`} live={now[ph.planner.jobId]} />}
                {ph.packets.map((id) => <PacketNode key={id} pid={pid} s={s} t={t} id={id} now={now} />)}
                {ph.checkpoint && !ph.checkpoint.decision && <YouLeaf>Phase {ph.number} landed. The checkpoint is waiting on you before phase {ph.number + 1} is planned.</YouLeaf>}
                {ph.checkpoint?.decision && (
                  <Leaf mark="done">
                    <span className="text-[14px]">
                      Checkpoint: {ph.checkpoint.decision === "approve" ? `you approved phase ${ph.number + 1}` : "you stopped here"}
                      {ph.checkpoint.note && <span className="text-ink-2"> — “{ph.checkpoint.note}”</span>}
                    </span>
                  </Leaf>
                )}
              </Node>
            ))
          : t.order.map((id) => <PacketNode key={id} pid={pid} s={s} t={t} id={id} now={now} />)}
        {t.plan?.nextPhases.map((p, i) => (
          <Leaf key={i} mark="idle"><span className="text-[14px] text-ink-3">Phase {t.phase + i + 1}, not planned yet: {p}</span></Leaf>
        ))}
      </Node>

      <Node
        open={accMark === "you" || accMark === "run" || acc?.ok === false}
        mark={accMark}
        title={<><span className="heading">Checked against the spec</span> <span className={acc?.ok && counts!.forYou ? "text-accent-ink" : "text-ink-2"}>{!acc ? (t.stage === "landed" ? "" : "— once every packet has landed") : acc.ok ? `— ${checkedWords(counts!)}` : `— not yet: ${acc.failures.map((f) => f.split(" ")[0]).join(", ")}`}</span></>}
      >
        <Rows pid={pid} t={t} now={now} rows={taskRows(s, t, "accept")} title="Architect closing the gap to the spec" />
      </Node>

      {t.landed && <Leaf mark="done"><span className="heading">Landed</span> <span className="text-ink-2">on <code className="font-mono">{t.landed.branch}</code> at <code className="font-mono">{t.landed.head.slice(0, 7)}</code>; arrow/main includes it</span></Leaf>}
      {t.haltedReason && <Leaf mark="idle"><span className="heading">Stopped</span> <span className="text-ink-2">— {t.haltedReason}</span></Leaf>}
    </div>
  );
}

/** Never just "passed": what Arrow ran, and what is left for a person. */
function checkedWords(c: { ran: number; forYou: number }) {
  if (!c.ran) return c.forYou ? `Arrow could run none of them; all ${c.forYou} are for you to check` : "no checks";
  return `Arrow ran ${c.ran}, all passed${c.forYou ? `; ${c.forYou} more are for you to check` : ""}`;
}

function YouLeaf({ children }: { children: React.ReactNode }) {
  return (
    <Leaf mark="you">
      <span className="text-[14px] text-accent-ink">{children} <a href="#needs" className="underline underline-offset-4">Answer it above</a></span>
    </Leaf>
  );
}

/** The task's own rows (not a packet's): agent runs, your decisions, the acceptance verdicts. */
function Rows({ pid, t, now, rows, title }: { pid: string; t: TaskView; now: Record<string, string>; rows: Row[]; title: string }) {
  let n = 0;
  return rows.map((r, i) => {
    switch (r.kind) {
      case "run":
        n++;
        return <AgentRun key={i} pid={pid} job={r.job} title={n > 1 ? `${title} (run ${n})` : title} live={now[r.job.jobId]} />;
      case "gate":
        return r.decision === "revise" ? (
          <Leaf key={i} mark="done">
            <span className="text-[14px]">You sent the plan back: “{r.note}”{r.plan && <span className="block text-[13px] text-ink-3">It had proposed: {r.plan}</span>}</span>
          </Leaf>
        ) : null; // an approved or stopped plan check is shown as the check itself
      case "accepted":
        return (
          <Node key={i} mark="done" title={r.ok ? `Arrow checked the finished task: ${checkedWords(acceptanceCounts(r.report))}` : <>Arrow checked the finished task <span className="text-ink-2">— {r.failures.length} failed</span></>}>
            {r.failures.length > 0 && <Body><ul className="list-disc pl-5">{r.failures.map((f) => <li key={f}>{f}</li>)}</ul></Body>}
            <Pre>{r.report.join("\n")}</Pre>
          </Node>
        );
      case "added":
        return <Leaf key={i} mark="done"><span className="text-[14px]">The architect added {r.packets.join(", ")} to close the gap</span></Leaf>;
      case "parked":
        return r.current ? <YouLeaf key={i}>Paused: {r.reason}</YouLeaf> : <Leaf key={i} mark="done"><span className="text-[14px] text-ink-2">Paused for you: {r.reason}</span></Leaf>;
      case "retried":
        return <Leaf key={i} mark="done"><span className="text-[14px] text-ink-2">You told it to try again</span></Leaf>;
      default:
        return null;
    }
  });
}

function SpecBody({ t }: { t: TaskView }) {
  const spec = t.spec!;
  return (
    <Body>
      <p className="measure text-ink-2">{spec.intent}</p>
      <p><span className="text-ink-3">How it runs:</span> {methodWords[spec.methodology.mode]} <span className="text-ink-3">{spec.methodology.why}</span></p>
      <div>
        <p className="text-[13px] text-ink-3">Done means</p>
        <ul className="divide-y divide-rule border-y border-rule">
          {spec.acceptance.map((a) => {
            const line = t.acceptance?.report.find((l) => l.slice(6).startsWith(`${a.id} `));
            const mark = !line ? null : line.startsWith("PASS") ? ["Passed", "text-ink-3"] : line.startsWith("FAIL") ? ["Failed", "font-medium text-ink"] : ["For you to check", "text-accent-ink"];
            return (
              <li key={a.id} className="flex gap-3 py-2">
                <code className="w-7 shrink-0 font-mono text-[12px] leading-6 text-ink-3">{a.id}</code>
                <div className="min-w-0 flex-1">
                  <p>{a.statement}</p>
                  <p className="break-words text-[13px] text-ink-3">Checked by <code className="font-mono">{a.check}</code></p>
                </div>
                {mark && <span className={`shrink-0 text-[13px] ${mark[1]}`}>{mark[0]}</span>}
              </li>
            );
          })}
        </ul>
      </div>
      {spec.outOfScope.length > 0 && <p><span className="text-ink-3">Not doing:</span> {spec.outOfScope.join("; ")}</p>}
      {t.answers &&
        spec.questions.map((q) => (
          <p key={q.id}><span className="text-ink-3">{q.question}</span> {t.answers![q.id]}</p>
        ))}
    </Body>
  );
}
