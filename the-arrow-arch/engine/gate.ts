/**
 * The rules gate. Same judgment at two moments:
 *   onboarding — does this repo, and Arrow tuned for it, sit right with the company's rules?
 *   plan       — would this plan change anything a critical rule protects?
 * Green: nothing critical is touched, one click to approve. Red: something
 * critical is at stake — the AI says continue or stop and what to do, the human decides.
 */
import { matchesAny } from "./glob";
import type { Gate, GateItem, Plan, Profile, Recommendation, Rule, Spec } from "./types";

const verdictOf = (items: GateItem[], rec: Recommendation): Gate["verdict"] =>
  items.some((i) => i.level === "critical") || rec.decision === "stop" ? "red" : "green";

export function onboardingGate(profile: Profile): Gate {
  const byId = new Map(profile.rules.map((r) => [r.id, r]));
  const items: GateItem[] = [];
  const seen = new Set<string>();

  for (const f of profile.findings) {
    const rule = byId.get(f.ruleId);
    seen.add(f.ruleId);
    const critical = rule?.criticality === "critical";
    items.push({
      level: f.status === "ok" ? "ok" : critical ? "critical" : "warning",
      ruleId: f.ruleId,
      title: rule?.text ?? f.ruleId,
      detail:
        f.status === "ok"
          ? f.evidence || "The repo already follows this."
          : `${statusWords[f.status]}${f.evidence ? ` ${f.evidence}` : ""}`,
      suggestion: f.status === "ok" ? undefined : f.suggestion || undefined,
    });
  }
  // a rule nobody checked is not "fine" — say so
  for (const r of profile.rules) {
    if (seen.has(r.id)) continue;
    items.push({
      level: r.criticality === "critical" ? "critical" : "warning",
      ruleId: r.id,
      title: r.text,
      detail: "The onboarder did not check this rule against the repo.",
      suggestion: "Re-run onboarding, or confirm by hand that the repo follows it.",
    });
  }
  items.sort((a, b) => rank[a.level] - rank[b.level]);
  return {
    id: "onboarding",
    kind: "onboarding",
    subject: "project",
    verdict: verdictOf(items, profile.recommendation),
    items,
    recommendation: profile.recommendation,
  };
}

export function planGate(taskId: string, plan: Plan, spec: Spec, rules: Rule[]): Gate {
  const items: GateItem[] = [];
  const critical = rules.filter((r) => r.criticality === "critical");
  const byId = new Map(rules.map((r) => [r.id, r]));

  // computed, not judged: every file every packet may change, against every protected path
  for (const p of plan.packets) {
    for (const r of critical) {
      if (!r.protectedPaths.length) continue;
      const hits = p.files.filter((f) => matchesAny(f, r.protectedPaths));
      if (hits.length)
        items.push({
          level: "critical",
          ruleId: r.id,
          title: `${p.id} would change files this rule protects`,
          detail: `"${r.text}" — ${p.id} (${p.title}) may change ${hits.join(", ")}.`,
          suggestion: "Stop and ask the architect for a plan that stays out of these paths, or continue if this change is intended.",
        });
    }
  }
  // the architect's own read of which rules the plan leans on
  for (const ri of plan.rulesImpact) {
    const r = byId.get(ri.ruleId);
    items.push({
      level: r?.criticality === "critical" ? "critical" : "warning",
      ruleId: ri.ruleId,
      title: r?.text ?? ri.ruleId,
      detail: ri.impact,
    });
  }
  if (spec.risk === "high")
    items.push({ level: "warning", title: "High-risk change", detail: "The project manager rated this task high risk." });
  if (!items.length)
    items.push({ level: "ok", title: "No company rule is affected", detail: `${plan.packets.length} packet(s), all inside allowed paths.` });

  items.sort((a, b) => rank[a.level] - rank[b.level]);
  return {
    id: `plan-${taskId}`,
    kind: "plan",
    subject: taskId,
    verdict: verdictOf(items, plan.advice),
    items,
    recommendation: plan.advice,
  };
}

const rank = { critical: 0, warning: 1, ok: 2 } as const;
const statusWords = {
  ok: "",
  violated: "The repo breaks this today.",
  conflict: "This clashes with how Arrow or the repo works.",
  unclear: "Couldn't confirm either way.",
} as const;
