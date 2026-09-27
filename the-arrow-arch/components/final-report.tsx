import type { TaskView } from "@/engine/types";

const verdictWords = {
  met: ["Met", "text-ink-3"],
  not_met: ["Not met", "font-medium text-ink"],
  unsure: ["For you to judge", "text-accent-ink"],
} as const;

/**
 * The final output: the project manager's review of the finished task, and the
 * way to open it. What the person reads first, once the work is done.
 */
export function FinalReportCard({ t, preview, repoPath, setup }: { t: TaskView; preview: string; repoPath?: string; setup?: string }) {
  const r = t.report!;
  const byId = new Map((t.spec?.acceptance ?? []).map((a) => [a.id, a]));
  const link = `${preview}/${t.taskId}/`;
  return (
    <section className="marked mt-8 rounded-sm bg-white px-5 py-5 sm:px-7">
      <p className="text-[13px] text-ink-3">Final report, from the project manager{t.landed ? "" : " — before it lands"}</p>
      <p className="measure mt-1 text-[18px] leading-snug">{r.summary}</p>

      <div className="mt-4">
        {r.view.how === "page" && (
          <a href={link} target="_blank" rel="noreferrer" className="btn btn-primary">
            Open the result
          </a>
        )}
        {r.view.how === "server" && (
          <div className="text-[14px]">
            <p className="text-ink-2">It runs as its own app. Start a copy of it outside Arrow&apos;s folders, then open <code className="font-mono">{r.view.entry || "/"}</code>:</p>
            {/* a copy in /tmp: Arrow's own clone stays on arrow/main, and nothing there is cleaned up under you */}
            <pre className="mt-2 overflow-auto rounded-sm bg-well p-3 font-mono text-[12px] text-ink-2">{`git -C ${repoPath} worktree add --detach /tmp/arrow-${t.taskId.toLowerCase()} ${t.landed?.head.slice(0, 7) ?? t.branch}\ncd /tmp/arrow-${t.taskId.toLowerCase()}${setup ? ` && ${setup}` : ""}\n${r.view.command}`}</pre>
          </div>
        )}
        {r.view.how === "none" && <p className="text-[14px] text-ink-2">There is nothing to open: this change is proven by its checks.</p>}
      </div>

      <h3 className="heading mt-6 text-[15px]">Done means, reviewed</h3>
      <ul className="mt-1.5 divide-y divide-rule border-y border-rule text-[14px]">
        {r.criteria.map((c) => {
          const [word, cls] = verdictWords[c.verdict];
          return (
            <li key={c.id} className="flex gap-3 py-2">
              <code className="w-7 shrink-0 font-mono text-[12px] leading-6 text-ink-3">{c.id}</code>
              <div className="min-w-0 flex-1">
                <p>{byId.get(c.id)?.statement ?? c.id}</p>
                {c.evidence && <p className="break-words text-[13px] text-ink-3">{c.evidence}</p>}
              </div>
              <span className={`shrink-0 text-[13px] ${cls}`}>{word}</span>
            </li>
          );
        })}
      </ul>

      {r.forYou.length > 0 && (
        <div className="mt-4 rounded-sm bg-accent-soft px-4 py-3 text-[14px]">
          <p className="heading text-accent-ink">For you to look at</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-2">{r.forYou.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      )}
      {r.notes.length > 0 && (
        <div className="mt-4 text-[14px]">
          <p className="heading">Worth knowing</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-2">{r.notes.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      )}
      <p className="mt-4 text-[12px] text-ink-3">The project manager&apos;s review is read from the code and Arrow&apos;s own run of the checks — an AI&apos;s judgment next to the proof, not a person&apos;s eyes.</p>
    </section>
  );
}
