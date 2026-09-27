/**
 * Fold the event log into state. Pure: same events in, same state out — the
 * UI and the orchestrator both call this, so they can never disagree.
 */
import { subject } from "./types";
import type { ArrowEvent, JobView, PacketView, ProjectState, TaskStage, TaskStep, TaskView } from "./types";

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
    humanNotes: {},
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
  // a subject is "T1:pm" (the task's own step) or "T1:P2:work" (one of its packets)
  const runningFor = (prefix: string) => Object.values(s.jobs).filter((j) => !j.finishedAt && j.subject.startsWith(prefix));
  const place = (sub: string) => {
    const [t, p, kind] = sub.split(":");
    return { task: s.tasks[t], packetId: kind ? p : undefined };
  };
  type StepBody = TaskStep extends infer T ? (T extends unknown ? Omit<T, "at" | "packetId"> : never) : never;
  const step = (task: TaskView | undefined, at: string, body: StepBody, packetId?: string) => {
    task?.timeline.push({ at, ...(packetId ? { packetId } : {}), ...body } as TaskStep);
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
        const where = place(e.subject);
        step(where.task, e.at, { kind: "job", jobId: e.jobId }, where.packetId);
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
        delete s.humanNotes[subject.onboard];
        break;
      case "gate.opened":
        s.gates[e.gate.id] = { ...e.gate };
        if (e.gate.kind === "onboarding") s.onboardingGateId = e.gate.id;
        else if (e.gate.kind === "plan" && s.tasks[e.gate.subject]) s.tasks[e.gate.subject].planGateId = e.gate.id;
        break;
      case "gate.decided": {
        const g = s.gates[e.gateId];
        if (!g || g.decision) break; // first decision wins; a gate is decided once
        Object.assign(g, { decision: e.decision, note: e.note, decidedAt: e.at });
        const t = g.kind === "onboarding" ? undefined : s.tasks[g.subject];
        step(t, e.at, { kind: "gate", gateId: g.id, decision: e.decision, note: e.note, plan: g.kind === "plan" && e.decision === "revise" ? t?.plan?.summary : undefined });
        if (e.decision === "revise") {
          // sent back: the same agent looks again, with the person's note; a new check opens after
          const sub = g.kind === "onboarding" ? subject.onboard : subject.architect(g.subject);
          s.humanNotes[sub] = e.note ?? "";
          resetRuns(sub);
          if (g.kind === "onboarding") Object.assign(s, { profile: undefined, onboardingGateId: undefined });
          else if (t) Object.assign(t, { plan: undefined, planGateId: undefined, packets: {}, order: [] });
        }
        if (g.kind === "onboarding" && e.decision === "stop") stopped = true;
        if (g.kind === "plan" && e.decision === "stop" && t) t.haltedReason = e.note || "You stopped this plan at the plan check.";
        if (g.kind === "phase" && t) {
          if (e.decision === "stop") t.haltedReason = e.note || `You stopped after phase ${t.phase}. What landed so far stays on ${t.branch}.`;
          else {
            resetRuns(subject.phase(t.taskId));
            if (e.note) s.humanNotes[subject.phase(t.taskId)] = e.note;
          }
        }
        break;
      }
      case "task.submitted":
        s.tasks[e.taskId] = { taskId: e.taskId, text: e.text, submittedAt: e.at, stage: "pm", packets: {}, order: [], phase: 0, timeline: [] };
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
        // a copy: the fold adds packets to it later and must never change the event it read
        const plan = { ...e.plan, packets: [...e.plan.packets], nextPhases: [...(e.plan.nextPhases ?? [])] }; // logs from before phases had none
        Object.assign(t, { plan, branch: e.branch, base: e.base, phase: 1 });
        delete s.humanNotes[subject.architect(e.taskId)];
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
        step(s.tasks[e.taskId], e.at, { kind: "verified", report: e.report }, e.packetId);
        break;
      }
      case "packet.failed": {
        const pk = s.tasks[e.taskId]?.packets[e.packetId];
        if (pk) Object.assign(pk, { status: "failed", lastFailure: e.failure, report: e.failure.report ?? pk.report });
        step(s.tasks[e.taskId], e.at, { kind: "failed", failure: e.failure }, e.packetId);
        break;
      }
      case "packet.repaired": {
        const pk = s.tasks[e.taskId]?.packets[e.packetId];
        if (!pk) break;
        step(s.tasks[e.taskId], e.at, { kind: "reaimed", note: e.note, before: pk.packet }, e.packetId);
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
        step(s.tasks[e.taskId], e.at, { kind: "merged", head: e.head }, e.packetId);
        break;
      }
      case "step.parked": {
        s.parked[e.subject] = { reason: e.reason, at: e.at };
        const where = place(e.subject);
        step(where.task, e.at, { kind: "parked", subject: e.subject, reason: e.reason }, where.packetId);
        const hit = packetOf(e.subject);
        if (hit) Object.assign(hit[1], { status: "parked", parkedReason: e.reason });
        break;
      }
      case "step.retried": {
        resetRuns(e.subject);
        const where = place(e.subject);
        step(where.task, e.at, { kind: "retried", subject: e.subject }, where.packetId);
        const tAcc = e.subject.endsWith(":accept") ? s.tasks[e.subject.split(":")[0]] : undefined;
        if (tAcc) {
          tAcc.acceptance = undefined;
          resetRuns(subject.complete(tAcc.taskId));
        }
        // a review sent back by a person is written again (their note is in knowledge)
        const tRep = e.subject.endsWith(":report") ? s.tasks[e.subject.split(":")[0]] : undefined;
        if (tRep) {
          tRep.report = undefined;
          resetRuns(subject.complete(tRep.taskId));
        }
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
      case "plan.extended": {
        const t = s.tasks[e.taskId];
        if (!t?.plan) break;
        // logs written before `by` existed: the step still running is the one that added them
        const by = e.by ?? (runningFor(`${e.taskId}:`).some((j) => j.subject.endsWith(":complete")) ? "completion" : "reaim");
        const from = e.from ?? (by === "reaim" ? runningFor(`${e.taskId}:`).find((j) => j.subject.endsWith(":repair"))?.subject.split(":")[1] : undefined);
        const added: string[] = [];
        for (const p of e.packets) {
          if (t.packets[p.id]) continue;
          t.plan.packets.push(p);
          t.order.push(p.id);
          t.packets[p.id] = { packet: p, status: "waiting", attempts: 0, repairs: 0, origin: { by, from, reason: e.reason } };
          added.push(p.id);
        }
        step(t, e.at, { kind: "added", packets: added, reason: e.reason, by, from }, from);
        if (by === "phase") {
          t.plan.nextPhases = e.nextPhases ?? [];
          t.phase += 1;
          delete s.humanNotes[subject.phase(e.taskId)];
        }
        t.acceptance = undefined; // new work: the finished whole is checked, and reviewed, again
        t.report = undefined;
        resetRuns(subject.accept(e.taskId));
        resetRuns(subject.report(e.taskId));
        break;
      }
      case "task.accepted":
        if (s.tasks[e.taskId]) s.tasks[e.taskId].acceptance = { ok: true, report: e.report, failures: [] };
        step(s.tasks[e.taskId], e.at, { kind: "accepted", report: e.report });
        break;
      case "task.unaccepted":
        if (s.tasks[e.taskId]) s.tasks[e.taskId].acceptance = { ok: false, report: e.report, failures: e.failures };
        step(s.tasks[e.taskId], e.at, { kind: "unaccepted", report: e.report, failures: e.failures });
        break;
      case "task.reported":
        if (s.tasks[e.taskId]) s.tasks[e.taskId].report = e.report;
        step(s.tasks[e.taskId], e.at, { kind: "reported", unmet: e.report.criteria.filter((c) => c.verdict === "not_met").map((c) => c.id) });
        break;
      case "task.landed":
        if (s.tasks[e.taskId]) s.tasks[e.taskId].landed = { branch: e.branch, head: e.head };
        step(s.tasks[e.taskId], e.at, { kind: "landed", branch: e.branch, head: e.head });
        break;
      case "task.halted":
        if (s.tasks[e.taskId]) s.tasks[e.taskId].haltedReason = e.reason;
        step(s.tasks[e.taskId], e.at, { kind: "halted", reason: e.reason });
        break;
      case "knowledge.recorded":
        for (const k of e.entries)
          if (!s.knowledge.some((x) => x.text === k.text && x.source === k.source)) s.knowledge.push({ id: `K${s.knowledge.length + 1}`, ...k, at: e.at });
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
