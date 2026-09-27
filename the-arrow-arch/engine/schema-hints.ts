/**
 * The closed sets in a result schema, as a short list for the prompt.
 *
 * A model cannot infer an enum it was never shown: the onboarder invented four
 * company-rule categories, none of them legal, and a whole onboarding run was
 * thrown away for it. The example in roles.ts teaches the shape; it cannot
 * teach the vocabulary, because it only ever shows two of the seven categories.
 *
 * The schemas now coerce an unknown `category` or `kind` to a fallback instead
 * of failing the run, which stops the loss but not the mistake — a rule filed
 * as "other" is silently wrong. Telling the model the set is cheaper than
 * either.
 *
 * Reading the sets off the schema itself — the same object the orchestrator
 * validates against — means a new enum member reaches every prompt without
 * anyone remembering to copy it into prose.
 */
import { z } from "zod";

/** Every `enum` in a schema, as "path: a | b | c". Never throws: a hint is not worth a run. */
export function allowedValues(schema: z.ZodType): string[] {
  let root: Record<string, unknown>;
  try {
    root = z.toJSONSchema(schema, { io: "input" }) as Record<string, unknown>;
  } catch {
    return []; // a schema zod can't convert simply gets no hints
  }

  const out: string[] = [];
  const walk = (node: unknown, at: string, depth = 0): void => {
    if (!node || typeof node !== "object" || depth > 12) return;
    const n = node as Record<string, unknown>;
    // a shape used twice is emitted as a $ref — follow it so its enums are still listed
    if (typeof n.$ref === "string" && n.$ref.startsWith("#/")) {
      const target = n.$ref
        .slice(2)
        .split("/")
        .reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], root);
      return walk(target, at, depth + 1);
    }
    if (Array.isArray(n.enum) && n.enum.length) {
      out.push(`${at || "(root)"}: ${n.enum.join(" | ")}`);
      return;
    }
    if (n.items) walk(n.items, `${at}[]`, depth + 1);
    for (const [key, sub] of Object.entries((n.properties as Record<string, unknown>) ?? {}))
      walk(sub, at ? `${at}.${key}` : key, depth + 1);
    for (const key of ["anyOf", "oneOf", "allOf"])
      for (const sub of (n[key] as unknown[]) ?? []) walk(sub, at, depth + 1);
  };
  walk(root, "");
  return [...new Set(out)];
}
