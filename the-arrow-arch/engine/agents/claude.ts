/**
 * Claude Code in headless mode. The same harness can drive another model through
 * an Anthropic-compatible endpoint (DeepSeek, Kimi, Qwen) — set on the Settings page.
 */
import { PROVIDERS } from "../settings";
import { spawnLogged, type Driver, type Usage } from "./driver";

export const claude: Driver = async (r) => {
  let sessionId: string | undefined;
  let cost: number | undefined;
  let usage: Usage | undefined;
  const p = PROVIDERS[r.cfg.provider];
  const env = { ...r.env };
  const baseUrl = r.cfg.baseUrl || p.baseUrl;
  if (baseUrl) env.ANTHROPIC_BASE_URL = baseUrl;
  if (r.cfg.provider !== "anthropic" && env[p.key]) env.ANTHROPIC_AUTH_TOKEN = env[p.key];
  if (r.cfg.model || p.model) env.ANTHROPIC_MODEL = r.cfg.model || p.model;
  const args = [
    ...(r.resume ? ["--resume", r.resume] : []),
    "-p",
    "--output-format", "stream-json", "--verbose",
    // the agent runs unattended inside its own clone/worktree; git is the undo
    "--dangerously-skip-permissions",
    "--strict-mcp-config", // no MCP servers from the user's own setup
    "--disallowedTools", "Bash(git push:*)", "Bash(sudo:*)", // variadic: keep last
  ];
  const exit = await spawnLogged(
    process.env.ARROW_CLAUDE_CMD || "claude",
    args,
    { ...r, env },
    (line) => {
      if (!line.startsWith("{")) return;
      try {
        const ev = JSON.parse(line);
        if (ev.session_id) sessionId = ev.session_id;
        if (ev.type === "result") {
          if (typeof ev.total_cost_usd === "number") cost = ev.total_cost_usd;
          const u = ev.usage ?? {};
          const input = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
          usage = { input, output: u.output_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, total: input + (u.output_tokens ?? 0) };
        }
      } catch {
        /* partial line */
      }
    },
    r.prompt,
  );
  return { ...exit, sessionId, usage, cost, costUnit: cost === undefined ? undefined : "usd" };
};
