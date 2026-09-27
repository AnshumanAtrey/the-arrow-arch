/** Minimal glob matching (`**`, `*`, `?`) — enough for scope lists and protected paths. */

const cache = new Map<string, RegExp>();

export function globToRegExp(glob: string): RegExp {
  let re = cache.get(glob);
  if (re) return re;
  let src = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      // "**/" matches zero or more directories; a trailing "**" matches everything below
      src += glob[i + 2] === "/" ? "(?:.*/)?" : ".*";
      i += glob[i + 2] === "/" ? 2 : 1;
    } else if (c === "*") src += "[^/]*";
    else if (c === "?") src += "[^/]";
    else src += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  re = new RegExp(`^${src}$`);
  cache.set(glob, re);
  return re;
}

const norm = (p: string) => p.replace(/^\.\//, "").replace(/\/+$/, "");

/** A path matches a pattern; a bare directory pattern ("db/migrations") covers everything under it. */
export function matches(file: string, pattern: string): boolean {
  const f = norm(file);
  const p = norm(pattern);
  if (!/[*?]/.test(p)) return f === p || f.startsWith(p + "/");
  return globToRegExp(p).test(f);
}

export const matchesAny = (file: string, patterns: string[]) => patterns.some((p) => matches(file, p));

/** Could two scope entries (paths or globs) ever name the same file? Errs towards "yes". */
export function overlaps(a: string, b: string): boolean {
  if (matches(a, b) || matches(b, a)) return true;
  const stem = (g: string) => norm(g).split(/[*?]/)[0];
  const sa = stem(a);
  const sb = stem(b);
  return /[*?]/.test(a) && /[*?]/.test(b) && (sa.startsWith(sb) || sb.startsWith(sa));
}
