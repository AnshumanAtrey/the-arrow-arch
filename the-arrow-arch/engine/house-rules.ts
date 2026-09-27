/**
 * Arrow's opinionated defaults — one per problem category in the research
 * (dataset/problem_categories). Onboarding compares each with the company's
 * rules and the repo as it is, and returns one outcome per rule:
 *
 *   keep       the company is silent — Arrow's default stands
 *   replace    the company has its own version — theirs wins (normal rules: green)
 *   dont_grow  the repo can't meet the default today — what's over stays, nothing gets worse
 *   conflict   the company contradicts the default — on a critical rule, a person decides
 */
import { z } from "zod";

export const HouseSettings = z.object({
  fileSize: z.object({
    targetLines: z.number().int().positive(),
    maxLines: z.number().int().positive(),
    exempt: z.array(z.string()),
  }),
  docs: z.object({ allowPaths: z.array(z.string()) }), // where new .md files may be added
  tests: z.object({ mayEditExisting: z.boolean(), requireApprovalForNewSkips: z.boolean().default(true) }),
  dependencies: z.object({ requireApproval: z.boolean(), approved: z.array(z.string()) }),
  placeholders: z.object({ allowedPattern: z.string() }), // e.g. "TODO\\([A-Z]+-\\d+\\)"; "" = none allowed
  diff: z.object({ maxChangedLines: z.number().int().positive() }),
  proof: z.object({ always: z.array(z.enum(["typecheck", "lint", "test", "build"])) }),
  loops: z.object({ codeRetries: z.number().int().min(0).max(3), repairs: z.number().int().min(0).max(3) }),
  ports: z.object({ base: z.number().int().min(1024).max(60000), perWorker: z.number().int().min(1).max(100) }),
});
export type HouseSettings = z.infer<typeof HouseSettings>;

export const DEFAULTS: HouseSettings = {
  fileSize: {
    targetLines: 300,
    maxLines: 500,
    exempt: ["**/*.lock", "**/*-lock.json", "**/*.lockb", "**/*.snap", "**/*.svg", "**/*.min.*", "**/migrations/**", "**/generated/**", "**/fixtures/**", "**/*.csv", "**/*.json"],
  },
  docs: { allowPaths: [] },
  tests: { mayEditExisting: false, requireApprovalForNewSkips: true },
  dependencies: { requireApproval: true, approved: [] },
  placeholders: { allowedPattern: "" },
  diff: { maxChangedLines: 400 },
  proof: { always: ["typecheck", "lint"] },
  loops: { codeRetries: 1, repairs: 1 },
  ports: { base: 4100, perWorker: 10 },
};

type Key = keyof HouseSettings;
export type HouseRule = { id: string; key: Key | null; title: string; criticality: "critical" | "normal"; category: string; plain: string };

export const HOUSE_RULES: HouseRule[] = [
  { id: "H-VERIFY", key: null, category: "C04", criticality: "critical", title: "Arrow re-runs every check itself", plain: "A worker saying it's done changes nothing; only checks Arrow re-ran count." },
  { id: "H-TESTS", key: "tests", category: "C04", criticality: "critical", title: "Existing tests are never weakened", plain: "Workers may add tests; they may not delete or loosen existing assertions, or add a way to skip or focus one — that parks for you." },
  { id: "H-SCOPE", key: null, category: "C06", criticality: "critical", title: "A packet changes only its listed files", plain: "Anything outside the packet's file list fails the check." },
  { id: "H-SECRETS", key: null, category: "C13", criticality: "critical", title: "No secrets in code, commits or agent environments", plain: "Added lines are scanned for keys; agents get only the variables their packet names." },
  { id: "H-NOPUSH", key: null, category: "C06", criticality: "critical", title: "Nothing is pushed; no production credentials", plain: "Pushing is disabled on Arrow's copy; work lands on a local branch for you to review." },
  { id: "H-FILESIZE", key: "fileSize", category: "C01", criticality: "normal", title: "Source files stay small (300 target, 500 cap)", plain: "Big files are where agents lose the thread; a file over the cap may not grow." },
  { id: "H-DOCS", key: "docs", category: "C08", criticality: "normal", title: "Workers don't add markdown files", plain: "What agents learn goes into Arrow's record, not into new .md files in your repo." },
  { id: "H-DEPS", key: "dependencies", category: "C07", criticality: "normal", title: "New dependencies need approval", plain: "A packet that adds a library must say so, and you see it at the plan check." },
  { id: "H-PLACEHOLDERS", key: "placeholders", category: "C04", criticality: "normal", title: "No TODO placeholders instead of work", plain: "Added lines may not leave TODO / FIXME / not-implemented stubs." },
  { id: "H-DIFF", key: "diff", category: "C12", criticality: "normal", title: "Each packet stays reviewable (400 changed lines)", plain: "A bigger change goes back to the architect to be split." },
  { id: "H-PROOF", key: "proof", category: "C03", criticality: "normal", title: "Typecheck and lint join every packet's proof", plain: "When the repo has a typecheck or lint command, it runs on every packet; failures that were already there are not blamed. A repo without them runs each packet's own checks — that is fine." },
  { id: "H-LOOPS", key: "loops", category: "C05", criticality: "normal", title: "One retry, one re-plan, then you", plain: "No agent keeps patching; after the budget a person looks." },
  { id: "H-PORTS", key: "ports", category: "C09", criticality: "normal", title: "Each worker gets its own port range", plain: "Parallel workers never fight over a local port." },
];

export const HouseOutcome = z.object({
  id: z.string(),
  outcome: z.enum(["keep", "replace", "dont_grow", "conflict"]),
  why: z.string().default(""),
  // the company's version of the rule's settings (replace / dont_grow / conflict)
  settings: z.record(z.string(), z.unknown()).optional(),
});
export type HouseOutcome = z.infer<typeof HouseOutcome>;

/**
 * The settings Arrow actually runs with. A critical conflict applies only once a
 * person approved the onboarding check; until then the default stands.
 */
export function effectiveSettings(outcomes: HouseOutcome[] = [], approved = false): HouseSettings {
  const out: HouseSettings = structuredClone(DEFAULTS);
  for (const o of outcomes) {
    const rule = HOUSE_RULES.find((r) => r.id === o.id);
    if (!rule?.key || o.outcome === "keep") continue;
    if (o.outcome === "conflict" && rule.criticality === "critical" && !approved) continue;
    const merged = { ...out[rule.key], ...(o.settings ?? {}) };
    const parsed = HouseSettings.shape[rule.key].safeParse(merged);
    if (parsed.success) (out as Record<Key, unknown>)[rule.key] = parsed.data;
  }
  return out;
}

/** Every house rule gets an outcome; missing or unknown ids are normalised to "keep". */
export function normaliseOutcomes(outcomes: HouseOutcome[] = []): HouseOutcome[] {
  return HOUSE_RULES.map((r) => outcomes.find((o) => o.id === r.id) ?? { id: r.id, outcome: "keep", why: "" });
}
