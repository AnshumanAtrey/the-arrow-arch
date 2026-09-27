/**
 * The rules gate. Same judgment at two moments:
 *   onboarding — does this repo, and Arrow tuned for it, sit right with the company's rules?
 *   plan       — would this plan change anything a critical rule protects?
 * Green: nothing critical is touched, one click to approve. Red: something
 * critical is at stake — the AI says continue or stop and what to do, the human decides.
 */
import { matchesAny } from "./glob";
import { HOUSE_RULES, normaliseOutcomes, type HouseSettings } from "./house-rules";
import type { Gate, GateItem, Plan, Profile, Recommendation, Rule, Spec } from "./types";

const verdictOf = (items: GateItem[], rec: Recommendation): Gate["verdict"] =>
  items.some((i) => i.level === "critical") || rec.decision === "stop" ? "red" : "green";

export function onboardingGate(profile: Profile, extra: GateItem[] = []): Gate {
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
  items.push(...houseItems(profile), ...extra);
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

export function planGate(taskId: string, plan: Plan, spec: Spec, rules: Rule[], house: HouseSettings): Gate {
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
  // new libraries are shown, so approving the plan is approving them
  if (house.dependencies.requireApproval)
    for (const p of plan.packets)
      for (const d of p.newDependencies.filter((d) => !house.dependencies.approved.includes(d)))
        items.push({ level: "warning", title: `${p.id} adds the library ${d}`, detail: `Approving this plan approves adding ${d}.`, suggestion: "Stop if the team would rather build it without a new dependency." });
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

/**
 * How onboarding tuned Arrow's house rules for this company. A normal rule the
 * company replaces stays green (theirs wins); a critical one they contradict is
 * red — Arrow's default stands until a person approves the change.
 */
function houseItems(profile: Profile): GateItem[] {
  const items: GateItem[] = [];
  for (const o of normaliseOutcomes(profile.houseRules)) {
    const rule = HOUSE_RULES.find((r) => r.id === o.id)!;
    if (o.outcome === "keep") {
      items.push({ level: "ok", ruleId: rule.id, title: rule.title, detail: "Arrow's default, kept." });
      continue;
    }
    const critical = o.outcome === "conflict" && rule.criticality === "critical";
    const what = o.outcome === "dont_grow" ? "The repo can't meet this today — what's over stays, nothing may get worse." : o.outcome === "replace" ? "Your company's version replaces Arrow's." : "Your company's rules contradict this.";
    items.push({
      level: critical ? "critical" : "ok",
      ruleId: rule.id,
      title: rule.title,
      detail: `${what}${o.why ? ` ${o.why}` : ""}`,
      suggestion: critical ? `Continue only if you accept the company's version over "${rule.plain}" Arrow keeps its default until you approve.` : undefined,
    });
  }
  return items;
}
