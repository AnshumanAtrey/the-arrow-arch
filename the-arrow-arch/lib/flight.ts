/** Where the arrow is: onboarding -> project manager -> architect -> workers -> landed. */
import { phaseGateId, type ProjectState, type TaskView } from "@/engine/types";

export type Tone = "blue" | "gold" | "red" | "green";
export type Flight = { stations: { name: string; detail: string }[]; at: number; tone: Tone };

const methodWords = { one_shot: "one shot", phased: "in phases", iterative: "iterative" } as const;

export function flightOf(s: ProjectState, t?: TaskView): Flight {
  const rules = s.profile?.rules ?? [];
  const onboardGate = s.onboardingGateId ? s.gates[s.onboardingGateId] : undefined;
  const pks = t ? t.order.map((id) => t.packets[id]) : [];
  const merged = pks.filter((p) => p.status === "merged").length;
  const stations = [
    {
      name: "Onboarding",
      detail: s.profile ? `${rules.length} rules, ${rules.filter((r) => r.criticality === "critical").length} critical` : s.repo ? "Reading the repo" : "Copying the repo",
    },
    { name: "Project manager", detail: t?.spec ? `Spec ready, ${methodWords[t.spec.methodology.mode]}` : t ? "Writing the spec" : "Waiting for a task" },
    { name: "Architect", detail: t?.plan ? `${t.plan.packets.length} packet${t.plan.packets.length === 1 ? "" : "s"}` : "" },
    { name: "Workers", detail: t?.plan ? `${merged} of ${pks.length} landed` : "" },
    { name: "Landed", detail: t?.landed ? t.landed.branch : "" },
  ];

  if (s.stage === "stopped") return { stations, at: 0, tone: "red" };
  if (s.stage !== "ready") {
    if (s.stage === "onboarding_gate" && onboardGate) {
      stations[0].detail = onboardGate.verdict === "green" ? "All green, waiting for your approval" : "Critical rule at stake, your call";
      return { stations, at: 0, tone: onboardGate.verdict === "green" ? "gold" : "red" };
    }
    return { stations, at: 0, tone: "blue" };
  }
  if (!t) return { stations, at: 1, tone: "blue" };

  const gate = t.planGateId ? s.gates[t.planGateId] : undefined;
  const parked = Object.keys(s.parked).some((k) => k.startsWith(`${t.taskId}:`));
  switch (t.stage) {
    case "pm":
      return { stations, at: 1, tone: parked ? "gold" : "blue" };
    case "questions":
      stations[1].detail = "Has questions for you";
      return { stations, at: 1, tone: "gold" };
    case "architect":
      stations[2].detail = "Splitting the work into packets";
      return { stations, at: 2, tone: parked ? "gold" : "blue" };
    case "plan_gate":
      stations[2].detail = gate?.verdict === "red" ? "Plan touches a critical rule, your call" : "All green, waiting for your approval";
      return { stations, at: 2, tone: gate?.verdict === "red" ? "red" : "gold" };
    case "building": {
      const checkpoint = s.gates[phaseGateId(t)];
      if (checkpoint && !checkpoint.decision) {
        stations[3].detail = `Phase ${t.phase} landed, waiting for you`;
        return { stations, at: 3, tone: "gold" };
      }
      return { stations, at: 3, tone: parked ? "gold" : "blue" };
    }
    case "landed":
      return { stations, at: 4, tone: "green" };
    case "halted":
      return { stations, at: t.plan ? (t.planGateId && gate?.decision === "approve" ? 3 : 2) : 1, tone: "red" };
  }
}
