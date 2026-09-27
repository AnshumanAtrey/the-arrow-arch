/**
 * Claude Code in headless mode, on the logged-in session of whichever command the
 * role is set to (claude, claude1, ...). Arrow never sets a key for it unless you
 * saved one in Settings; model and effort go through the CLI's own flags. The same
 * harness can point at another model through an Anthropic-compatible endpoint.
 */
import { PROVIDERS } from "../settings";
import { spawnLogged, type Driver, type Usage } from "./driver";

export const claude: Driver = async (r) => {
  let sessionId: string | undefined;
  let cost: number | undefined;
  let usage: Usage | undefined;
  const env = { ...r.env };
  if (r.cfg.provider !== "anthropic") {
    const p = PROVIDERS[r.cfg.provider];
    if (r.cfg.baseUrl || p.baseUrl) env.ANTHROPIC_BASE_URL = r.cfg.baseUrl || p.baseUrl;
    if (env[p.key]) env.ANTHROPIC_AUTH_TOKEN = env[p.key];
  }
  const model = r.cfg.model || (r.cfg.provider !== "anthropic" ? PROVIDERS[r.cfg.provider].model : "");
  const args = [
    ...(r.resume ? ["--resume", r.resume] : []),
    "-p",
    "--output-format", "stream-json", "--verbose",
    ...(model ? ["--model", model] : []),
    ...(r.cfg.effort ? ["--effort", r.cfg.effort] : []),
    // the agent runs unattended inside its own clone/worktree; git is the undo
    "--dangerously-skip-permissions",
    "--strict-mcp-config", // no MCP servers from the user's own setup
    "--disallowedTools", "Bash(git push:*)", "Bash(sudo:*)", // variadic: keep last
  ];
  const exit = await spawnLogged(
    r.cfg.command || process.env.ARROW_CLAUDE_CMD || "claude",
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
