/** Claude Code in headless mode. Reads session id and cost off its JSON stream. */
import { spawnLogged, type Driver } from "./driver";

export const claude: Driver = async (r) => {
  let sessionId: string | undefined;
  let costUsd: number | undefined;
  const args = [
    ...(r.resume ? ["--resume", r.resume] : []),
    "-p",
    r.prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    // the agent runs unattended inside its own clone/worktree; git is the undo
    "--dangerously-skip-permissions",
  ];
  const exit = await spawnLogged(process.env.ARROW_CLAUDE_CMD || "claude", args, r, (line) => {
    if (!line.startsWith("{")) return;
    try {
      const ev = JSON.parse(line);
      if (ev.session_id) sessionId = ev.session_id;
      if (ev.type === "result" && typeof ev.total_cost_usd === "number") costUsd = ev.total_cost_usd;
    } catch {
      /* partial line */
    }
  });
  return { ...exit, sessionId, costUsd };
};
