/** What is waiting on a human, derived from state. Shared by the server and the UI. */
import type { ProjectState } from "@/engine/types";

export type Need =
  | { kind: "gate"; key: string; gateId: string; taskId?: string; tone: "red" | "green"; title: string }
  | { kind: "questions"; key: string; taskId: string; tone: "gold"; title: string }
  | { kind: "parked"; key: string; subject: string; taskId?: string; tone: "gold"; title: string; reason: string };

export function needsOf(s: ProjectState): Need[] {
  const out: Need[] = [];
  for (const g of Object.values(s.gates)) {
    if (g.decision) continue;
    if (g.kind === "plan" && s.tasks[g.subject]?.stage === "halted") continue;
    out.push({
      kind: "gate", key: `gate:${g.id}`, gateId: g.id, taskId: g.kind === "plan" ? g.subject : undefined, tone: g.verdict,
      title: g.kind === "onboarding" ? "Approve the rules check for this repo" : `Approve the plan for ${g.subject}`,
    });
  }
  for (const tid of s.taskOrder) {
    const t = s.tasks[tid];
    if (t.stage === "questions")
      out.push({ kind: "questions", key: `q:${tid}`, taskId: tid, tone: "gold", title: `${tid} has ${t.spec!.questions.length === 1 ? "a question" : `${t.spec!.questions.length} questions`} for you` });
  }
  for (const [sub, p] of Object.entries(s.parked)) {
    const taskId = /^T\d+/.test(sub) ? sub.split(":")[0] : undefined;
    if (taskId && ["landed", "halted"].includes(s.tasks[taskId]?.stage ?? "")) continue;
    out.push({ kind: "parked", key: `p:${sub}`, subject: sub, taskId, tone: "gold", title: `Paused: ${labelOf(sub)}`, reason: p.reason });
  }
  return out;
}

/** "T1:P2:work" -> "T1, packet P2 (worker)" */
export function labelOf(sub: string): string {
  const [a, b, c] = sub.split(":");
  const names: Record<string, string> = {
    clone: "copying the repository", onboard: "onboarding", pm: "project manager", architect: "architect",
    prepare: "preparing its copy", work: "worker", verify: "checking the work", merge: "merging", repair: "architect re-aiming the packet",
    accept: "checking the finished task against the spec", complete: "architect closing the gap to the spec",
  };
  if (!b) return names[a] ?? a;
  if (!c) return `${a}, ${names[b] ?? b}`;
  return `${a}, packet ${b} (${names[c] ?? c})`;
}
