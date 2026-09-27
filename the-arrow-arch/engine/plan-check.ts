import type { Plan } from "./types";

/** Checks a model can get wrong but code can prove: unique ids, real deps, no cycles. */
export function planProblem(plan: Plan): string | undefined {
  const ids = plan.packets.map((p) => p.id);
  const dup = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dup) return `Packet id ${dup} is used twice.`;
  for (const p of plan.packets) {
    if (!/^[A-Za-z0-9-]+$/.test(p.id) || p.id.includes("--")) return `Packet id "${p.id}" may only use letters, digits and single dashes.`;
    const missing = p.deps.find((d) => !ids.includes(d));
    if (missing) return `${p.id} depends on ${missing}, which is not in the plan.`;
  }
  const deps = new Map(plan.packets.map((p) => [p.id, p.deps]));
  const seen = new Set<string>();
  const stack = new Set<string>();
  const cyclic = (id: string): boolean => {
    if (stack.has(id)) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    stack.add(id);
    const hit = (deps.get(id) ?? []).some(cyclic);
    stack.delete(id);
    return hit;
  };
  const loop = ids.find(cyclic);
  return loop ? `The packet dependencies loop back on themselves (through ${loop}).` : undefined;
}
