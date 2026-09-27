/**
 * Which engine each role runs on, and the keys those engines need. Opinionated
 * defaults (Bob Shell for every role); the Settings page changes them. Stored in
 * the data folder with owner-only permissions; keys are never sent back in full.
 */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { DATA_DIR } from "./config";

export const HARNESSES = ["bob", "claude", "mock"] as const;
export const ROLES = ["onboarder", "pm", "architect", "worker"] as const;
export type Harness = (typeof HARNESSES)[number];
export type RoleName = (typeof ROLES)[number];

/** Model providers the Claude Code harness can point at (Anthropic-compatible endpoints). */
export const PROVIDERS = {
  anthropic: { label: "Anthropic", key: "ANTHROPIC_API_KEY", baseUrl: "", model: "" },
  deepseek: { label: "DeepSeek", key: "DEEPSEEK_API_KEY", baseUrl: "https://api.deepseek.com/anthropic", model: "deepseek-v4-pro" },
  kimi: { label: "Kimi (Moonshot)", key: "MOONSHOT_API_KEY", baseUrl: "https://api.moonshot.ai/anthropic", model: "kimi-k3" },
  qwen: { label: "Qwen (DashScope)", key: "DASHSCOPE_API_KEY", baseUrl: "", model: "qwen3-coder-plus" },
} as const;
export type Provider = keyof typeof PROVIDERS;

export const KEY_NAMES = ["BOB_API_KEY", "ANTHROPIC_API_KEY", "DEEPSEEK_API_KEY", "MOONSHOT_API_KEY", "DASHSCOPE_API_KEY"] as const;

export const EFFORTS = ["", "low", "medium", "high", "xhigh", "max"] as const;
const RoleCfg = z.object({
  harness: z.enum(HARNESSES),
  // the command that starts the harness — use your own wrapper to pick a logged-in session (claude, claude1)
  command: z.string().trim().regex(/^[\w./-]*$/, "A command name or path, no spaces or flags").max(200).default(""),
  provider: z.enum(Object.keys(PROVIDERS) as [Provider, ...Provider[]]).default("anthropic"),
  model: z.string().trim().regex(/^[\w.:-]*$/).max(100).default(""),
  effort: z.enum(EFFORTS).default(""),
  baseUrl: z.string().trim().max(300).default(""), // override the provider's endpoint
});
export type RoleCfg = z.infer<typeof RoleCfg>;

export const Settings = z.object({
  roles: z.object({ onboarder: RoleCfg, pm: RoleCfg, architect: RoleCfg, worker: RoleCfg }),
  keys: z.partialRecord(z.enum(KEY_NAMES), z.string().max(500)).default({}),
  bob: z
    .object({
      teamId: z.string().trim().max(100).default(""), // only for a "general" API key
      maxCostPerRun: z.number().positive().max(10_000).optional(), // bobcoins
      maxTurns: z.number().int().positive().max(500).optional(),
      readersUseSubagents: z.boolean().default(true), // onboarder / PM / architect may fan out to read
    })
    .default({ teamId: "", readersUseSubagents: true }),
});
export type Settings = z.infer<typeof Settings>;

const role = (harness: Harness): RoleCfg => ({ harness, command: "", provider: "anthropic", model: "", effort: "", baseUrl: "" });
export const DEFAULT_SETTINGS: Settings = {
  roles: { onboarder: role("bob"), pm: role("bob"), architect: role("bob"), worker: role("bob") },
  keys: {},
  bob: { teamId: "", readersUseSubagents: true },
};

const file = () => path.join(DATA_DIR, "settings.json");

export function readSettings(): Settings {
  try {
    const parsed = Settings.safeParse(JSON.parse(fs.readFileSync(file(), "utf8")));
    if (parsed.success) return parsed.data;
  } catch {
    /* no settings yet */
  }
  // ARROW_DRIVER still works for scripts and tests; the Settings page wins once saved
  const env = process.env.ARROW_DRIVER as Harness | undefined;
  if (env && HARNESSES.includes(env)) return { ...DEFAULT_SETTINGS, roles: Object.fromEntries(ROLES.map((r) => [r, role((process.env[`ARROW_DRIVER_${r.toUpperCase()}`] as Harness) || env)])) as Settings["roles"] };
  return DEFAULT_SETTINGS;
}

export function writeSettings(next: Settings) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${file()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 1), { mode: 0o600 });
  fs.renameSync(tmp, file());
  fs.chmodSync(file(), 0o600);
}

/** What the UI may see: which keys are set, never their values. */
export function publicSettings(s: Settings) {
  return {
    ...s,
    keys: Object.fromEntries(KEY_NAMES.map((k) => [k, s.keys[k] ? `set, ends …${s.keys[k]!.slice(-4)}` : ""])),
  };
}

/** Keys a role's harness needs, by name. */
export function keysFor(cfg: RoleCfg): string[] {
  if (cfg.harness === "bob") return ["BOB_API_KEY"];
  if (cfg.harness === "claude") return [PROVIDERS[cfg.provider].key];
  return [];
}

export const harnessFor = (role: string): Harness => readSettings().roles[role as RoleName]?.harness ?? "bob";
