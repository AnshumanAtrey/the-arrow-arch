import { NextResponse } from "next/server";
import { z } from "zod";
import { checkBranch, checkRepoSource } from "@/engine/git";
import { project, runningJobs } from "@/engine/project";
import { append, listProjectIds, newProjectId, readEvents } from "@/engine/store";
import { needsOf } from "@/lib/needs";
import { fromThisSite } from "@/lib/same-site";

export const dynamic = "force-dynamic";

export async function GET() {
  const projects = listProjectIds().map((id) => {
    const s = project(id, readEvents(id));
    const active = s.taskOrder.map((t) => s.tasks[t]).filter((t) => t.stage !== "landed" && t.stage !== "halted");
    const needs = needsOf(s).map((n) => ({ key: n.key, title: n.title, taskId: n.taskId, tone: n.tone }));
    return {
      id, name: s.name, repoUrl: s.repoUrl, stage: s.stage, updatedAt: s.updatedAt,
      tasks: s.taskOrder.length, activeTasks: active.length, needs: needs.length, needList: needs,
      running: runningJobs(s).filter((j) => j.role !== "orchestrator").length,
    };
  });
  projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return NextResponse.json({ projects });
}

const Body = z.object({
  repoUrl: z.string().trim().min(1, "Add the repository."),
  branch: z.string().trim().optional(),
  rulesText: z.string().max(20_000, "Rules are limited to 20,000 characters.").default(""),
});

export async function POST(req: Request) {
  if (!fromThisSite(req)) return NextResponse.json({ error: "Actions come from Arrow's own pages." }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  const { repoUrl, branch, rulesText } = parsed.data;
  const src = checkRepoSource(repoUrl);
  if (!src.ok) return NextResponse.json({ error: src.error }, { status: 400 });
  if (branch && !checkBranch(branch)) return NextResponse.json({ error: "That branch name isn't valid." }, { status: 400 });

  const id = newProjectId(src.value);
  const name = src.value.replace(/\.git$/, "").split(/[/:]/).filter(Boolean).slice(-2).join("/");
  append(id, { type: "project.created", name, repoUrl: src.value, branch: branch || undefined, rulesText });
  return NextResponse.json({ id }, { status: 201 });
}
