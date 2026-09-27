/**
 * The house-rule checks, as pure functions over what a packet changed. The
 * orchestrator gathers the facts from git (verify.ts); these decide. Each returns
 * a failure or nothing — no judgment, no model.
 */
import { matchesAny } from "./glob";
import type { HouseSettings } from "./house-rules";
import type { Failure } from "./types";

export type FileFacts = {
  path: string;
  added: boolean; //       new in this packet
  linesNow: number;
  linesBefore: number; //  0 for new files
  addedLines: string[]; // the "+" lines of the diff, without the "+"
};

const fail = (cls: Failure["class"], message: string, report: string[] = []): Failure => ({ class: cls, message, report });
const isDoc = (p: string) => /\.(md|mdx|markdown)$/i.test(p);
const isBinaryish = (p: string) => /\.(png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|zip|gz)$/i.test(p);

/** C01 — 300 target / 500 cap. A file already over the cap may stay, but may not grow. */
export function fileSizeCheck(files: FileFacts[], s: HouseSettings["fileSize"]): Failure | undefined {
  const bad: string[] = [];
  for (const f of files) {
    if (isDoc(f.path) || isBinaryish(f.path) || matchesAny(f.path, s.exempt)) continue;
    if (f.linesNow <= s.maxLines) continue;
    if (!f.added && f.linesBefore > s.maxLines && f.linesNow <= f.linesBefore) continue; // was over already, not made worse
    bad.push(`${f.path}: ${f.linesNow} lines (cap ${s.maxLines}${f.added ? ", new file" : `, was ${f.linesBefore}`})`);
  }
  return bad.length
    ? fail("scope", `A file is over the ${s.maxLines}-line cap. Split it into smaller files (aim for ${s.targetLines}).`, bad)
    : undefined;
}

/** C08 — workers don't add markdown files, except where the company keeps docs. */
export function docsCheck(files: FileFacts[], s: HouseSettings["docs"]): Failure | undefined {
  const bad = files.filter((f) => f.added && isDoc(f.path) && !matchesAny(f.path, s.allowPaths)).map((f) => f.path);
  return bad.length
    ? fail("scope", `Added markdown files: ${bad.join(", ")}. Record what you learned in your result instead${s.allowPaths.length ? `, or write docs only under ${s.allowPaths.join(", ")}` : ""}.`)
    : undefined;
}

const PLACEHOLDER = /\b(TODO|FIXME|XXX|HACK)\b|not implemented|NotImplementedError|unimplemented!|implement me/i;

/** C04 — added lines may not leave stubs where the work should be. */
export function placeholderCheck(files: FileFacts[], s: HouseSettings["placeholders"]): Failure | undefined {
  const allowed = s.allowedPattern ? safeRegExp(s.allowedPattern) : null;
  const hits: string[] = [];
  for (const f of files) {
    if (isDoc(f.path)) continue;
    for (const l of f.addedLines) {
      if (!PLACEHOLDER.test(l)) continue;
      if (allowed && allowed.test(l)) continue;
      hits.push(`${f.path}: ${l.trim().slice(0, 120)}`);
    }
  }
  return hits.length ? fail("verification", "The change leaves placeholders instead of finished work.", hits.slice(0, 20)) : undefined;
}

const SECRET_PATTERNS: [string, RegExp][] = [
  ["AWS access key", /AKIA[0-9A-Z]{16}/],
  ["private key", /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/],
  ["GitHub token", /\b(?:ghp|gho|ghs|ghu)_[A-Za-z0-9]{36}\b|github_pat_[A-Za-z0-9_]{40,}/],
  ["Slack token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["model provider key", /\bsk-(?:ant-|proj-)?[A-Za-z0-9_]{32,}/],
  ["hard-coded secret", /\b(?:password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token)\b\s*[:=]\s*["'][^"'\s]{12,}["']/i],
];

/** C13 — nothing that looks like a credential enters the code. Critical: parks for a person. */
export function secretCheck(files: FileFacts[]): Failure | undefined {
  const hits: string[] = [];
  for (const f of files)
    for (const l of f.addedLines)
      for (const [name, re] of SECRET_PATTERNS) if (re.test(l)) hits.push(`${f.path}: looks like a ${name}`);
  return hits.length ? fail("protected", "The change adds what looks like a secret. It stays out of the branch until you look.", [...new Set(hits)]) : undefined;
}

/** C07 — a dependency the plan didn't name is not added silently. */
export function dependencyCheck(added: string[], declared: string[], s: HouseSettings["dependencies"]): Failure | undefined {
  if (!s.requireApproval) return undefined;
  const ok = new Set([...declared, ...s.approved].map((d) => d.toLowerCase()));
  const surprise = added.filter((d) => !ok.has(d.toLowerCase()));
  return surprise.length
    ? fail("scope", `Added dependencies the approved plan didn't include: ${surprise.join(", ")}.`)
    : undefined;
}

/** C12 — one packet stays small enough for a person to review. */
export function diffBudgetCheck(changedLines: number, s: HouseSettings["diff"]): Failure | undefined {
  return changedLines > s.maxChangedLines
    ? fail("scope", `Changed ${changedLines} lines; one packet may change at most ${s.maxChangedLines}. It needs to be split.`)
    : undefined;
}

/** New dependency names between two versions of a manifest (package.json or requirements.txt). */
export function newDependencies(file: string, before: string, after: string): string[] {
  if (file.endsWith("package.json")) {
    const keys = (txt: string) => {
      try {
        const j = JSON.parse(txt || "{}");
        return new Set(["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].flatMap((k) => Object.keys(j[k] ?? {})));
      } catch {
        return new Set<string>();
      }
    };
    const was = keys(before);
    return [...keys(after)].filter((k) => !was.has(k));
  }
  if (/requirements[^/]*\.txt$/.test(file)) {
    const names = (txt: string) =>
      new Set(txt.split("\n").map((l) => l.trim().split(/[<>=!~\[;\s]/)[0].toLowerCase()).filter((n) => n && !n.startsWith("#") && !n.startsWith("-")));
    const was = names(before);
    return [...names(after)].filter((n) => !was.has(n));
  }
  return [];
}

function safeRegExp(src: string): RegExp | null {
  try {
    return new RegExp(src);
  } catch {
    return null;
  }
}
