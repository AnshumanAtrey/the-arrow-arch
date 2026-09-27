/**
 * IBM Bob Shell, headless: `bob run --format json`, prompt on stdin. Bob reads
 * and writes the workspace itself; Arrow only needs the result file back, plus
 * the stats Bob prints at the end (tokens, bobcoins, duration, task id to resume).
 */
import { spawnLogged, type AgentExit, type Driver } from "./driver";

export const bob: Driver = async (r) => {
  const readOnlyRole = r.role !== "worker";
  const args = [
    "run", "--format", "json", "--trust", "--accept-license", "--disable-mcp",
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

/** The last JSON object Bob printed: {status, stats: {task_id, input_tokens, ...}, last_message}. */
export function stats(out: string): Partial<AgentExit> {
  const start = out.lastIndexOf('{"type"');
  const text = start >= 0 ? out.slice(start) : out.slice(out.indexOf("{"));
  try {
    const j = JSON.parse(text.trim());
    const st = j.stats ?? {};
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    const cost = typeof st.session_costs === "number" ? st.session_costs : Array.isArray(st.session_costs) ? st.session_costs.reduce((a: number, c: { cost?: number }) => a + n(c?.cost), 0) : undefined;
    return {
      sessionId: typeof st.task_id === "string" ? st.task_id : undefined,
      usage: { input: n(st.input_tokens), output: n(st.output_tokens), cacheRead: n(st.cache_read_tokens), total: n(st.total_tokens) || n(st.input_tokens) + n(st.output_tokens) },
      cost,
      costUnit: cost === undefined ? undefined : "bobcoins",
    };
  } catch {
    return {};
  }
}
