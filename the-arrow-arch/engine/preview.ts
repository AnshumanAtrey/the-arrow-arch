/**
 * The finished work, opened in a browser. Serves a task's files straight out of
 * git — at the commit Arrow landed, or the task branch while it is still being
 * built — on its own port: a different origin from the UI, so nothing a page
 * runs can reach Arrow. Nothing is checked out and no code of the task runs here.
 */
import { execFile } from "node:child_process";
import http from "node:http";
import { promisify } from "node:util";
import { LIMITS } from "./config";
import { project } from "./project";
import { listProjectIds, readEvents } from "./store";

const git = promisify(execFile);
const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8", css: "text/css; charset=utf-8", js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8", json: "application/json", map: "application/json", svg: "image/svg+xml", png: "image/png",
  jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", ico: "image/x-icon", woff: "font/woff", woff2: "font/woff2",
  txt: "text/plain; charset=utf-8", md: "text/plain; charset=utf-8", wasm: "application/wasm",
  // source a browser can't run is shown as text, not downloaded
  ts: "text/plain; charset=utf-8", tsx: "text/plain; charset=utf-8", py: "text/plain; charset=utf-8", go: "text/plain; charset=utf-8", rs: "text/plain; charset=utf-8",
};

type Reply = { status: number; type: string; body: Buffer | string; location?: string };
const say = (status: number, body: string): Reply => ({ status, type: "text/plain; charset=utf-8", body });

/** GET /<project>/<task>/<path> — a file of that task; /<project>/<task>/ opens the report's entry, else index.html. */
export async function preview(pathname: string): Promise<Reply> {
  const [pid, tid, ...rest] = pathname.split("/").filter(Boolean).map((x) => decodeURIComponent(x));
  if (!pid || !tid || !listProjectIds().includes(pid)) return say(404, "No such project.");
  const s = project(pid, readEvents(pid));
  const t = s.tasks[tid];
  const ref = t?.landed?.head ?? t?.branch;
  if (!t || !ref || !s.repo) return say(404, `${tid} has nothing to show yet.`);
  if (!rest.length) {
    const entry = (t.report?.view.how === "page" && t.report.view.entry) || "index.html";
    return { status: 302, type: "text/plain", body: "", location: `/${pid}/${tid}/${entry.replace(/^\/+/, "")}` };
  }
  if (rest.some((seg) => seg === "." || seg === ".." || !/^[\w@.+~-]+$/.test(seg))) return say(400, "Bad path.");
  const file = rest.join("/");
  try {
    const kind = (await git("git", ["-C", s.repo.path, "cat-file", "-t", `${ref}:${file}`])).stdout.toString().trim();
    if (kind !== "blob") return say(404, `${file} isn't a file in ${tid}.`);
    const { stdout } = await git("git", ["-C", s.repo.path, "show", `${ref}:${file}`], { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });
    return { status: 200, type: TYPES[file.split(".").pop()!.toLowerCase()] ?? "application/octet-stream", body: stdout };
  } catch {
    return say(404, `${file} isn't in ${tid}.`);
  }
}

export function startPreviewServer() {
  const server = http.createServer(async (req, res) => {
    const r = req.method === "GET" || req.method === "HEAD" ? await preview(new URL(req.url ?? "/", "http://x").pathname) : say(405, "Read only.");
    res.writeHead(r.status, { "content-type": r.type, "cache-control": "no-store", ...(r.location ? { location: r.location } : {}) });
    res.end(req.method === "HEAD" ? undefined : r.body);
  });
  server.on("error", (e) => console.error(`[arrow] preview server: ${e.message}`));
  server.listen(LIMITS.previewPort, "127.0.0.1", () => console.log(`[arrow] finished work is served at http://localhost:${LIMITS.previewPort}/<project>/<task>/`));
  return server;
}
