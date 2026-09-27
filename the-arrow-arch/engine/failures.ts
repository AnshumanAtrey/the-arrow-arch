import type { Failure } from "./types";

/**
 * Phrases a model provider, CLI or network prints when IT fails — never the
 * code's fault. Bare socket errors (econnrefused) are deliberately absent: a
 * worker legitimately boots a local server and its healthy startup prints them.
 */
const PROVIDER_MARKS = [
  "spend limit", "insufficient balance", "credit balance is too low", "quota has been exhausted",
  "rate limit", "rate_limit", "too many requests", '"api_error_status":429', '"api_error_status":402',
  '"api_error_status":529', "overloaded_error", "overloaded", "no response from api",
  "can't reach the api server", "unable to connect to api", "enotfound", "econnreset", "etimedout",
  "service unavailable", "bad gateway", "network error",
];

export type ExitInfo = { exitCode: number; timedOut: boolean; tail: string };

/**
 * Only the tail counts: a failure that killed the agent is the last thing it
 * printed, while a passing mention early in a long run is not evidence.
 */
export function classifyExit(x: ExitInfo): Failure | undefined {
  if (x.timedOut) return { class: "timeout", message: "Ran out of time. Its work so far is kept." };
  if (x.exitCode === 0) return undefined;
  const tail = x.tail.slice(-4000).toLowerCase();
  const mark = PROVIDER_MARKS.find((m) => tail.includes(m));
  if (mark) return { class: "provider", message: `The model provider failed (${mark}). Not a code problem.` };
  if (x.exitCode === 127) return { class: "internal", message: "The agent command was not found. Check ARROW_*_CMD." };
  return { class: "internal", message: `The agent process exited with code ${x.exitCode}.` };
}
