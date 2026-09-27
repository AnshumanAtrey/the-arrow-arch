/**
 * Fold the event log into state. Pure: same events in, same state out — the
 * UI and the orchestrator both call this, so they can never disagree.
 */
import { subject } from "./types";
import type { ArrowEvent, JobView, PacketView, ProjectState, TaskStage, TaskView } from "./types";

const NOT_AN_ATTEMPT = new Set(["provider", "internal"]); // outages don't spend an attempt

export function project(pid: string, events: ArrowEvent[]): ProjectState {
  const s: ProjectState = {
    id: pid,
    name: pid,
    repoUrl: "",
    rulesText: "",
    createdAt: "",
    stage: "cloning",
    gates: {},
    tasks: {},
    taskOrder: [],
    jobs: {},
    runs: {},
    sessions: {},
    parked: {},
    knowledge: [],
    reaped: [],
    notes: [],
    events: events.length,
    updatedAt: events.at(-1)?.at ?? "",
  };
  let stopped = false;

  const packetOf = (sub: string): [TaskView, PacketView] | undefined => {
    const [t, p] = sub.split(":");
    const task = s.tasks[t];
    const pk = task?.packets[p];
    return task && pk ? [task, pk] : undefined;
  };
  const resetRuns = (sub: string) => {
    s.runs[sub] = [];
    delete s.parked[sub];
  };

  for (const e of events) {
    switch (e.type) {
      case "project.created":
        Object.assign(s, { name: e.name, repoUrl: e.repoUrl, branch: e.branch, rulesText: e.rulesText, createdAt: e.at });
        break;
      case "repo.cloned":
        s.repo = { path: e.path, branch: e.branch, head: e.head };
        break;
      case "job.started": {
        const j: JobView = {
          jobId: e.jobId, role: e.role, subject: e.subject, attempt: e.attempt, driver: e.driver, startedAt: e.at, port: e.port,
        };
        s.jobs[e.jobId] = j;
        (s.runs[e.subject] ??= []).push(j);
        const hit = packetOf(e.subject);
        if (hit) {
          const kind = e.subject.split(":")[2];
          const next = { prepare: "preparing", work: "working", verify: "verifying", merge: "merging" } as const;
          hit[1].status = next[kind as keyof typeof next] ?? hit[1].status;
        }
        break;
      }
      case "job.spawned":
        if (s.jobs[e.jobId]) s.jobs[e.jobId].pid = e.pid;
        break;
      case "job.finished": {
        const j = s.jobs[e.jobId];
        if (!j) break;
        Object.assign(j, {
          finishedAt: e.at, ok: e.ok, failure: e.failure, durationMs: e.durationMs, sessionId: e.sessionId, tokens: e.tokens, cost: e.cost, costUnit: e.costUnit,
        });
        if (e.sessionId) s.sessions[j.subject] = e.sessionId;
        const hit = packetOf(j.subject);
        if (hit && j.subject.endsWith(":work")) {
          const pk = hit[1];
          if (!e.failure || !NOT_AN_ATTEMPT.has(e.failure.class)) pk.attempts += 1;
          if (e.ok) pk.status = "built";
          else {
            pk.status = "failed";
            pk.lastFailure = e.failure;
          }
        } else if (hit && !e.ok) {
          // the step itself crashed (not the code failing a check) — the loop manager reruns it
          const back = { prepare: "waiting", verify: "built", merge: "verified" } as const;
          const kind = j.subject.split(":")[2] as keyof typeof back;
          if (back[kind]) hit[1].status = back[kind];
        }
        break;
      }
      case "profile.ready":
        s.profile = e.profile;
        break;
      case "gate.opened":
        s.gates[e.gate.id] = { ...e.gate };
        if (e.gate.kind === "onboarding") s.onboardingGateId = e.gate.id;
        else if (s.tasks[e.gate.subject]) s.tasks[e.gate.subject].planGateId = e.gate.id;
        break;
      case "gate.decided": {
        const g = s.gates[e.gateId];
        if (!g || g.decision) break; // first decision wins; a gate is decided once
        Object.assign(g, { decision: e.decision, note: e.note, decidedAt: e.at });
        if (g.kind === "onboarding" && e.decision === "stop") stopped = true;
        if (g.kind === "plan" && e.decision === "stop" && s.tasks[g.subject]) {
          s.tasks[g.subject].haltedReason = e.note || "You stopped this plan at the plan check.";
        }
        break;
      }
      case "task.submitted":
        s.tasks[e.taskId] = { taskId: e.taskId, text: e.text, submittedAt: e.at, stage: "pm", packets: {}, order: [] };
        s.taskOrder.push(e.taskId);
        break;
      case "spec.ready":
        if (s.tasks[e.taskId]) s.tasks[e.taskId].spec = e.spec;
        break;
      case "questions.answered":
        if (s.tasks[e.taskId]) s.tasks[e.taskId].answers = e.answers;
        break;
      case "plan.ready": {
        const t = s.tasks[e.taskId];
        if (!t) break;
        Object.assign(t, { plan: e.plan, branch: e.branch, base: e.base });
        t.order = e.plan.packets.map((p) => p.id);
        t.packets = Object.fromEntries(
          e.plan.packets.map((p) => [p.id, { packet: p, status: "waiting", attempts: 0, repairs: 0 } as PacketView]),
        );
        break;
      }
      case "worktree.ready": {
        const pk = s.tasks[e.taskId]?.packets[e.packetId];
        if (pk) Object.assign(pk, { status: "prepared", worktree: e.path, baseline: e.baseline });
        break;
      }
      case "packet.verified": {
        const pk = s.tasks[e.taskId]?.packets[e.packetId];
        if (pk) Object.assign(pk, { status: "verified", report: e.report, changedFiles: e.changedFiles, lastFailure: undefined });
        break;
      }
      case "packet.failed": {
        const pk = s.tasks[e.taskId]?.packets[e.packetId];
        if (pk) Object.assign(pk, { status: "failed", lastFailure: e.failure, report: e.failure.report ?? pk.report });
        break;
      }
      case "packet.repaired": {
        const pk = s.tasks[e.taskId]?.packets[e.packetId];
        if (!pk) break;
        // a new aim gets a clean shot: fresh worktree, fresh red-first check
        Object.assign(pk, { packet: e.packet, status: "waiting", attempts: 0, repairs: pk.repairs + 1, parkedReason: undefined, worktree: undefined, baseline: undefined });
        resetRuns(subject.prepare(e.taskId, e.packetId));
        resetRuns(subject.work(e.taskId, e.packetId));
        resetRuns(subject.merge(e.taskId, e.packetId));
        break;
      }
      case "packet.merged": {
        const pk = s.tasks[e.taskId]?.packets[e.packetId];
        if (pk) pk.status = "merged";
        break;
      }
      case "step.parked": {
        s.parked[e.subject] = { reason: e.reason, at: e.at };
        const hit = packetOf(e.subject);
        if (hit) Object.assign(hit[1], { status: "parked", parkedReason: e.reason });
        break;
      }
      case "step.retried": {
        resetRuns(e.subject);
        const hit = packetOf(e.subject);
        if (hit && hit[1].status === "parked") {
          const kind = e.subject.split(":")[2];
          const pk = hit[1];
          // a retried worker keeps its worktree and the work in it; only a failed prepare starts over
          const status = kind === "merge" ? "verified" : kind === "verify" ? "built" : kind === "work" && pk.baseline ? "prepared" : "waiting";
          Object.assign(pk, { status, attempts: 0, parkedReason: undefined });
          resetRuns(subject.work(hit[0].taskId, pk.packet.id));
          resetRuns(subject.prepare(hit[0].taskId, pk.packet.id));
        }
        break;
      }
      case "task.landed":
        if (s.tasks[e.taskId]) s.tasks[e.taskId].landed = { branch: e.branch, head: e.head };
        break;
      case "task.halted":
        if (s.tasks[e.taskId]) s.tasks[e.taskId].haltedReason = e.reason;
        break;
      case "knowledge.recorded":
        for (const k of e.entries) s.knowledge.push({ id: `K${s.knowledge.length + 1}`, ...k, at: e.at });
        break;
      case "project.frozen":
        s.frozen = e.frozen ? { reason: e.reason, at: e.at } : undefined;
        break;
      case "ledger.reaped":
        for (const it of e.items) s.reaped.push({ at: e.at, ...it });
        if (s.reaped.length > 50) s.reaped.splice(0, s.reaped.length - 50);
        break;
      case "note":
        s.notes.push({ at: e.at, level: e.level, message: e.message, subject: e.subject });
        break;
    }
  }

  for (const t of Object.values(s.tasks)) t.stage = taskStage(s, t);
  s.stage = stopped
    ? "stopped"
    : !s.repo
      ? "cloning"
      : !s.profile
        ? "onboarding"
        : !s.onboardingGateId || s.gates[s.onboardingGateId]?.decision !== "approve"
          ? "onboarding_gate"
          : "ready";
  return s;
}

function taskStage(s: ProjectState, t: TaskView): TaskStage {
  if (t.haltedReason) return "halted";
  if (t.landed) return "landed";
  if (!t.spec) return "pm";
  if (t.spec.questions.length && !t.answers) return "questions";
  if (!t.plan) return "architect";
  if (!t.planGateId || s.gates[t.planGateId]?.decision !== "approve") return "plan_gate";
  return "building";
}

/** Jobs still running (started, never finished). */
export const runningJobs = (s: ProjectState) => Object.values(s.jobs).filter((j) => !j.finishedAt);
