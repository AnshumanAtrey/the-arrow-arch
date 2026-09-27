/**
 * The house-rule checks, as pure functions over what a packet changed. The
 * orchestrator gathers the facts from git (verify.ts); these decide. Each returns
 * a failure or nothing — no judgment, no model.
 */
import path from "node:path";
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

const looksLikeTest = (f: string) =>
  /(^|\/)(tests?|__tests__|spec)\//.test(f) || /\.(test|spec)\.[a-z]+$/.test(path.basename(f)) || /^test_.*\.py$/.test(path.basename(f));

/** The assertion a language writes, across the ones Arrow meets: JS/TS, Python, Go, Rust. */
const ASSERTION = /\bexpect\s*\(|\bassert\b|\bassert_\w+!|\bpanic!\s*\(|\bt\.(?:Error|Fatal)\w*|\.should\b/g;

/**
 * H-TESTS — an existing test may be rewritten, but not left asserting less.
 * `before` is null for a file this packet created; `after` is null when it was
 * deleted. Assertions are counted, not lines: replacing an import used to read
 * as weakening a test, which rejected correct work and taught the worker to
 * leave dead code behind.
 */
export function testWeakenedCheck(file: string, before: string | null, after: string | null): Failure | undefined {
  if (before === null) return undefined; // nothing existed to weaken
  if (after === null) return fail("verification", `An existing test was deleted: ${file}.`);
  const was = assertions(before);
  const now = assertions(after);
  if (now >= was) return undefined;
  return fail("verification", `Weakened an existing test: ${file} has ${now} assertion(s), down from ${was}.`, [`-${was - now}: ${file}`]);
}

/**
 * Code only. Whole-line comments are skipped, so commenting a marker out is not
 * keeping it. `#` is a comment, except in Rust, where `#[ignore]` is an
 * attribute: a line that starts `#[ignore` counts as a marker, not a comment.
 */
const codeLines = (text: string): string =>
  text
    .split("\n")
    .filter((l) => !/^\s*(\/\/|#(?!\[)|\*|\/\*)/.test(l))
    .join("\n");

/** Assertion-shaped code in a file. */
export const assertions = (text: string): number => (codeLines(text).match(ASSERTION) ?? []).length;

/** The way a language switches a test off, across the ones Arrow meets: JS/TS, Python, Go, Rust. */
const DISABLE =
  /\bpytest\.mark\.(?:skip|skipif|xfail)\b|\bpytest\.(?:skip|importorskip)\s*\(|\b(?:it|test|describe)\.(?:skipIf|skip|only)(?:\.each)?\s*\(|\b(?:xit|xtest|xdescribe|fit|fdescribe)\s*\(|\bt\.Skip\w*\s*\(|#\[ignore\b/g;

/** A quoted run on one line, escapes included. */
const QUOTED = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g;

/**
 * Markers that switch a test off, and only in code. A marker a test quotes as
 * data — `expect(disables("it.skip('a', () => {})"))` — is not one, so quoted
 * runs go first. A heuristic, not a parser: a lone unclosed quote on a line
 * quotes nothing, and triple-quoted strings are not special.
 * Focus counts with skip: focusing one test silently stops the rest from
 * running, which proves as little as a skip.
 */
export const disables = (text: string): number => (codeLines(text).replace(QUOTED, "").match(DISABLE) ?? []).length;

/** For the report a person reads: the lines that carry a marker. */
const disableLines = (text: string): string[] =>
  codeLines(text)
    .split("\n")
    .filter((l) => disables(l))
    .map((l) => l.trim().slice(0, 120));

/**
 * H-TESTS — a test that switches itself off is a decision a person makes.
 * Counting assertions can't see it: the packet that added two
 * `pytest.mark.skipif` decorators kept all 16 assertions while making the one
 * that mattered unreachable, and was reported verified.
 * A count, not a diff of marker lines: rewording a skip's reason is not adding
 * one, and over-detection here parks correct work with no way out. The boundary
 * that buys: a skip removed and another added in the same file holds level, so a
 * moved skip goes uncaught — deliberate.
 * Classed `protected`, not `verification`: a skip is often legitimate (the data
 * really isn't there), so this parks for a person instead of spending a retry on
 * a worker that cannot win. `before` is null for a file this packet created;
 * `after` is null when it was deleted — a deletion testWeakenedCheck already owns.
 */
export function testDisabledCheck(file: string, before: string | null, after: string | null): Failure | undefined {
  if (before === null || after === null) return undefined;
  const was = disables(before);
  const now = disables(after);
  if (now <= was) return undefined;
  return fail("protected", `${file} gained ${now - was} way(s) to switch a test off (${was} -> ${now}). A skipped or focused test proves nothing; a person decides whether this one should.`, [
    `+${now - was}: ${file}`,
    ...[...new Set(disableLines(after))].slice(0, 19),
  ]);
}

export { looksLikeTest };

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
