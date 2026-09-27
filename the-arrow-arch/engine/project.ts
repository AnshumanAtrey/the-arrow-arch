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
          jobId: e.jobId, role: e.role, subject: e.subject, attempt: e.attempt, driver: e.driver, startedAt: e.at,
        };
        s.jobs[e.jobId] = j;
        (s.runs[e.subject] ??= []).push(j);
        const hit = packetOf(e.subject);
        if (hit) {
          const kind = e.subject.split(":")[2];
          hit[1].status = kind === "work" ? "working" : kind === "verify" ? "verifying" : kind === "merge" ? "merging" : hit[1].status;
        }
        break;
      }
      case "job.finished": {
        const j = s.jobs[e.jobId];
        if (!j) break;
        Object.assign(j, {
          finishedAt: e.at, ok: e.ok, failure: e.failure, durationMs: e.durationMs, costUsd: e.costUsd, sessionId: e.sessionId,
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
        } else if (hit && !e.ok && (j.subject.endsWith(":verify") || j.subject.endsWith(":merge"))) {
          // the check itself crashed (not the code failing it) — let the loop manager rerun it
          hit[1].status = j.subject.endsWith(":verify") ? "built" : "verified";
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
        Object.assign(pk, { packet: e.packet, status: "waiting", attempts: 0, repairs: pk.repairs + 1, parkedReason: undefined });
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
          Object.assign(hit[1], { status: kind === "merge" ? "verified" : "waiting", attempts: 0, parkedReason: undefined });
          resetRuns(subject.work(hit[0].taskId, hit[1].packet.id));
        }
        break;
      }
      case "task.landed":
        if (s.tasks[e.taskId]) s.tasks[e.taskId].landed = { branch: e.branch, head: e.head };
        break;
      case "task.halted":
        if (s.tasks[e.taskId]) s.tasks[e.taskId].haltedReason = e.reason;
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
