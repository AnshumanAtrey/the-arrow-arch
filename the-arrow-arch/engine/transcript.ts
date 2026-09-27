/**
 * An agent run's log, read back: the exact prompt it was given, then what it did —
 * one step per tool call, what it said, and how it ended. Reads the stream-json of
 * Claude Code and of Bob Shell (read off Bob's own renderer); any other line is
 * kept as a plain note, so a crash or a sign-in error is never hidden.
 */
export type Step =
  | { kind: "tool"; tool: string; detail: string; ok?: boolean; output?: string }
  | { kind: "text"; text: string }
  | { kind: "note"; text: string }
  | { kind: "end"; ok: boolean; text: string };

export type Transcript = {
  command: string;
  model?: string;
  effort?: string;
  prompt: string;
  /** the prompt cut at its top-level "# " headings: role, rules, who else is working, inputs... */
  sections: { title: string; body: string }[];
  steps: Step[];
};

const PROMPT = "\n----- prompt -----\n";
const OUTPUT = "\n----- output -----\n";
const MAX_NOTES = 200;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}… (${s.length - n} more characters)` : s);
// agents see absolute paths into Arrow's folder; the repo-relative part is what a person reads
const ARROW_PATH = /(?:\/[^/\s]+)*\/\.arrow-data\/projects\/[^/\s]+\/(?:worktrees\/[^/\s]+|repo|accept\/[^/\s]+)(\/)?/g;
const tidy = (s: string) => s.replace(ARROW_PATH, (_m, slash) => (slash ? "" : "."));

export function readTranscript(log: string): Transcript {
  const head = log.slice(0, log.indexOf("\n") + 1 || undefined).replace(/^\$ /, "").trim();
  const p = log.indexOf(PROMPT);
  const o = p < 0 ? -1 : log.indexOf(OUTPUT, p + PROMPT.length);
  const prompt = p < 0 ? "" : log.slice(p + PROMPT.length, o < 0 ? undefined : o);
  const output = o < 0 ? (p < 0 ? log : "") : log.slice(o + OUTPUT.length);
  const flag = (name: string) => head.match(new RegExp(`--${name} (\\S+)`))?.[1];
  return { command: head, model: flag("model"), effort: flag("effort"), prompt, sections: sectionsOf(prompt), steps: stepsOf(output) };
}

function sectionsOf(prompt: string) {
  const out: { title: string; body: string }[] = [];
  let fence = false;
  let cur: { title: string; lines: string[] } | undefined;
  for (const line of prompt.split("\n")) {
    if (line.startsWith("```")) fence = !fence;
    if (!fence && /^# \S/.test(line)) {
      if (cur) out.push({ title: cur.title, body: cur.lines.join("\n").trim() });
      cur = { title: line.slice(2).trim(), lines: [] };
    } else (cur ??= { title: "", lines: [] }).lines.push(line);
  }
  if (cur) out.push({ title: cur.title, body: cur.lines.join("\n").trim() });
  return out.filter((s) => s.title || s.body);
}

const DETAIL_KEYS = ["file_path", "path", "command", "pattern", "query", "url", "regex", "description"];
function detailOf(input: unknown): string {
  if (typeof input === "string") return clip(tidy(input), 300);
  if (!input || typeof input !== "object") return "";
  const o = input as Record<string, unknown>;
  for (const k of DETAIL_KEYS) if (typeof o[k] === "string" && o[k]) return clip(tidy(o[k] as string), 300);
  if (Array.isArray(o.todos)) return `${o.todos.length} to-dos`;
  return clip(tidy(JSON.stringify(o)), 300);
}

const textOf = (c: unknown): string =>
  typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => (typeof x === "string" ? x : x?.text ?? "")).join("\n") : c == null ? "" : JSON.stringify(c);

/** The steps in an engine's output. Also works on a tail of it, for "what is it doing now". */
export function stepsOf(output: string): Step[] {
  const steps: Step[] = [];
  const byId = new Map<string, Extract<Step, { kind: "tool" }>>();
  let notes = 0;
  let streaming: Extract<Step, { kind: "text" }> | undefined; // Bob streams its words in chunks
  const tool = (id: string | undefined, name: string, input: unknown) => {
    const s = { kind: "tool" as const, tool: name, detail: detailOf(input) };
    steps.push(s);
    if (id) byId.set(id, s);
    streaming = undefined;
  };
  const result = (id: string | undefined, ok: boolean, text: string) => {
    const s = id ? byId.get(id) : undefined;
    if (s) Object.assign(s, { ok, output: clip(tidy(text), 2000) });
  };

  for (const line of output.split("\n")) {
    const l = line.trim();
    if (!l) continue;
    let ev: Record<string, any> | undefined;
    if (l.startsWith("{")) {
      try {
        ev = JSON.parse(l);
      } catch {
        /* a partial line at the start of a tail */
      }
    }
    if (!ev || typeof ev.type !== "string") {
      if (notes++ < MAX_NOTES) steps.push({ kind: "note", text: clip(tidy(l), 500) });
      continue;
    }
    switch (ev.type) {
      // ---- Claude Code
      case "assistant":
        for (const c of ev.message?.content ?? []) {
          if (c.type === "tool_use") tool(c.id, c.name, c.input);
          else if (c.type === "text" && c.text?.trim()) steps.push({ kind: "text", text: clip(tidy(c.text.trim()), 4000) });
        }
        break;
      case "user":
        for (const c of ev.message?.content ?? []) if (c.type === "tool_result") result(c.tool_use_id, !c.is_error, textOf(c.content));
        break;
      // ---- Bob Shell
      case "tool_use":
        tool(ev.tool_id, ev.tool_name ?? "tool", ev.parameters);
        break;
      case "tool_result":
        result(ev.tool_id, ev.status !== "error", ev.status === "error" ? textOf(ev.error?.message) : textOf(ev.output));
        break;
      case "message": {
        if (ev.role !== "assistant" || ev.isReasoning) break;
        const chunk = textOf(ev.content);
        if (!chunk) break;
        if (!streaming) steps.push((streaming = { kind: "text", text: "" }));
        // chunks may be deltas or the whole message so far; handle both
        streaming.text = clip(tidy(chunk.startsWith(streaming.text) ? chunk : streaming.text + chunk), 4000);
        break;
      }
      case "error":
        steps.push({ kind: "note", text: clip(textOf(ev.message), 500) });
        break;
      // ---- both
      case "result":
        steps.push({
          kind: "end",
          ok: ev.is_error ? false : ev.status ? ev.status === "success" : ev.subtype ? ev.subtype === "success" : true,
          text: clip(tidy(textOf(ev.result ?? ev.last_message ?? "")), 4000),
        });
        streaming = undefined;
        break;
    }
  }
  return steps;
}

/** One line on what a running agent is doing right now, from the end of its log. */
export function nowLine(tail: string): string | undefined {
  const s = stepsOf(tail).filter((x) => x.kind !== "note").at(-1);
  if (!s) return undefined;
  if (s.kind === "tool") return `${s.tool} ${s.detail}`.trim();
  return s.text.split("\n")[0].slice(0, 200);
}
