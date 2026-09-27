import Link from "next/link";

/** The prompt exactly as it was sent: always the first thing on the page, line breaks kept. */
export function PromptBlock({ taskId, text, href }: { taskId: string; text: string; href?: string }) {
  return (
    <section className="rounded-sm border-l-[3px] border-l-ink bg-well px-5 py-4 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[13px] text-ink-3">
          <code className="font-mono text-ink-2">{taskId}</code>, the prompt as you sent it
        </p>
        {href && (
          <Link href={href} className="text-[13px] text-ink-2 underline decoration-rule-strong underline-offset-4 hover:text-ink">
            Open the task
          </Link>
        )}
      </div>
      <p className="measure mt-2 whitespace-pre-wrap break-words text-[16px] leading-relaxed text-ink">{text}</p>
    </section>
  );
}
