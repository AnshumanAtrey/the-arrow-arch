/**
 * IBM Bob Shell, headless: `bob run --format stream-json`, prompt on stdin. Bob
 * reads and writes the workspace itself; Arrow needs the result file back, the
 * stats line Bob prints last (bobcoins, duration, task id to resume), and the
 * tool calls before it, which the UI shows as the run's steps.
 */
import { spawnLogged, type AgentExit, type Driver } from "./driver";

export const bob: Driver = async (r) => {
  const readOnlyRole = r.role !== "worker";
  const args = [
    "run", "--format", "stream-json", "--trust", "--accept-license", "--disable-mcp",
    "-w", r.cwd,
    ...(r.resume ? ["--resume", r.resume] : []),
    ...(r.bob.teamId ? ["--team-id", r.bob.teamId] : []),
    ...(r.bob.maxCostPerRun ? ["--max-cost", String(r.bob.maxCostPerRun)] : []),
    ...(r.bob.maxTurns ? ["--max-turns", String(r.bob.maxTurns)] : []),
    // readers may fan out to subagents; writers never do — parallel writing is where agents collide
    ...(readOnlyRole && r.bob.readersUseSubagents ? [] : ["--disable-subagents"]),
  ];
  let out = "";
  const exit = await spawnLogged(process.env.ARROW_BOB_CMD || "bob", args, r, (line) => (out += `${line}\n`), r.prompt);
  return { ...exit, ...stats(out) };
};

/** The last JSON object Bob printed, on one line or pretty-printed. */
function lastJson(out: string): Record<string, any> | undefined {
  const text = out.trim();
  try {
    return JSON.parse(text);
  } catch {
    /* logs before the result — find the last object that parses */
  }
  for (let i = text.lastIndexOf("{"); i >= 0; i = text.lastIndexOf("{", i - 1)) {
    if (i > 0 && text[i - 1] !== "\n") continue; // objects start at a line start
    try {
      return JSON.parse(text.slice(i));
    } catch {
      /* keep looking */
    }
  }
  return undefined;
}

/**
 * Bob's result: {type: "result", status, stats: {task_id, session_costs, ...}}. Bob
 * includes token counts only for its own developers (BOB_DEV_KEY), so a normal run
 * reports bobcoins and no tokens — then there is no usage, not a usage of zero.
 */
export function stats(out: string): Partial<AgentExit> {
  try {
    const j = lastJson(out);
    if (!j) return {};
    const st = j.stats ?? {};
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    const cost = typeof st.session_costs === "number" ? st.session_costs : Array.isArray(st.session_costs) ? st.session_costs.reduce((a: number, c: { cost?: number }) => a + n(c?.cost), 0) : undefined;
    const counted = ["input_tokens", "output_tokens", "total_tokens"].some((k) => typeof st[k] === "number");
    return {
      sessionId: typeof st.task_id === "string" ? st.task_id : undefined,
      usage: counted ? { input: n(st.input_tokens), output: n(st.output_tokens), cacheRead: n(st.cache_read_tokens), total: n(st.total_tokens) || n(st.input_tokens) + n(st.output_tokens) } : undefined,
      cost,
      costUnit: cost === undefined ? undefined : "bobcoins",
    };
  } catch {
    return {};
  }
}
