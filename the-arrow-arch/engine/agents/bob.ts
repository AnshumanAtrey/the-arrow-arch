/**
 * IBM Bob Shell. Runs `bob run "<prompt>"` in the working folder by default;
 * ARROW_BOB_CMD / ARROW_BOB_ARGS adjust it without touching code. Bob reads and
 * writes the workspace directly, so the JSON result file is all Arrow needs back.
 */
import { spawnLogged, type Driver } from "./driver";

export const bob: Driver = (r) => {
  const pre = (process.env.ARROW_BOB_ARGS ?? "run").split(/\s+/).filter(Boolean);
  return spawnLogged(process.env.ARROW_BOB_CMD || "bob", [...pre, r.prompt], r);
};
