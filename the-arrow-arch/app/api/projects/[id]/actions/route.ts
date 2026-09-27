/**
 * Everything a human can do. Each action is checked against the current state
 * and then appended to the log — the orchestrator picks it up on its next tick.
 */
import fs from "node:fs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { project } from "@/engine/project";
import { append, paths, readEvents } from "@/engine/store";
import { labelOf } from "@/lib/needs";

export const dynamic = "force-dynamic";

const id = z.string().trim().min(1).max(80);
const Action = z.discriminatedUnion("type", [
  z.object({ type: z.literal("decide_gate"), gateId: id, decision: z.enum(["approve", "stop", "revise"]), note: z.string().max(2000).optional() }),
  z.object({ type: z.literal("submit_task"), text: z.string().trim().min(10, "Describe the task in a sentence or two.").max(8000) }),
  z.object({ type: z.literal("answer"), taskId: id, answers: z.record(z.string(), z.string().trim().min(1).max(2000)) }),
  z.object({ type: z.literal("retry"), subject: id, note: z.string().max(2000).optional() }),
  z.object({ type: z.literal("halt"), taskId: id, reason: z.string().max(2000).optional() }),
  z.object({ type: z.literal("freeze"), frozen: z.boolean(), reason: z.string().max(500).optional() }),
]);

const bad = (error: string, status = 409) => NextResponse.json({ error }, { status });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: pid } = await ctx.params;
  try {
    if (!fs.existsSync(paths(pid).events)) return bad("No such project.", 404);
  } catch {
    return bad("No such project.", 404);
  }
  const parsed = Action.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Invalid request.", 400);
  const a = parsed.data;
  const s = project(pid, readEvents(pid));

  switch (a.type) {
    case "decide_gate": {
      const g = s.gates[a.gateId];
      if (!g) return bad("That check doesn't exist.", 404);
      if (g.decision) return bad(`This check was already ${{ approve: "approved", stop: "stopped", revise: "sent back" }[g.decision]}.`);
      if (a.decision === "revise" && g.kind === "phase") return bad("A phase check is approved (with a note for the architect) or stopped.", 400);
      if (a.decision === "revise" && !a.note?.trim()) return bad("Say what should change — that note is what the agent works from.", 400);
      // stopping a plan halts its task; stopping onboarding stops the project; sending back re-runs the agent (see project.ts)
      append(pid, { type: "gate.decided", gateId: a.gateId, decision: a.decision, note: a.note?.trim() || undefined });
      // a person's reason is a decision the agents must follow from now on; a send-back note steers only the re-run
      if (a.note?.trim() && a.decision !== "revise")
        append(pid, { type: "knowledge.recorded", entries: [{ kind: "decision", text: a.note.trim(), source: `you, at the ${g.kind === "onboarding" ? "rules check" : `${g.kind} check for ${g.subject}`}` }] });
      break;
    }
    case "submit_task": {
      if (s.stage !== "ready") return bad("Finish onboarding first — tasks start once the rules check is approved.");
      const taskId = `T${s.taskOrder.length + 1}`;
      append(pid, { type: "task.submitted", taskId, text: a.text });
      return NextResponse.json({ ok: true, taskId });
    }
    case "answer": {
      const t = s.tasks[a.taskId];
      if (!t || t.stage !== "questions") return bad("This task isn't waiting on answers.");
      const missing = t.spec!.questions.filter((q) => !a.answers[q.id]);
      if (missing.length) return bad(`Answer every question (missing ${missing.map((q) => q.id).join(", ")}).`, 400);
      append(pid, { type: "questions.answered", taskId: a.taskId, answers: a.answers });
      append(pid, {
        type: "knowledge.recorded",
        entries: t.spec!.questions.map((q) => ({ kind: "decision" as const, text: `${q.question} — ${a.answers[q.id]}`, source: `you, answering ${a.taskId}` })),
      });
      break;
    }
    case "retry": {
      if (!s.parked[a.subject]) return bad("That step isn't paused.");
      // what you tell it becomes a decision every agent reads from now on, the retried one first
      if (a.note?.trim()) append(pid, { type: "knowledge.recorded", entries: [{ kind: "decision", text: a.note.trim(), source: `you, resuming ${labelOf(a.subject)}` }] });
      append(pid, { type: "step.retried", subject: a.subject, note: a.note?.trim() || undefined });
      break;
    }
    case "halt": {
      const t = s.tasks[a.taskId];
      if (!t) return bad("No such task.", 404);
      if (t.stage === "landed" || t.stage === "halted") return bad("This task has already finished.");
      append(pid, { type: "task.halted", taskId: a.taskId, reason: a.reason?.trim() || "You stopped this task." });
      break;
    }
    case "freeze": {
      if (Boolean(s.frozen) === a.frozen) return bad(a.frozen ? "Already frozen." : "Not frozen.");
      append(pid, { type: "project.frozen", frozen: a.frozen, reason: a.reason?.trim() || undefined });
      break;
    }
  }
  return NextResponse.json({ ok: true });
}
