"use client";

import { useState } from "react";

/** A square status mark: ink = done, ink ring = in progress, orange = waiting on you, grey = not yet. */
export type Mark = "done" | "run" | "you" | "idle" | "none";
const markClass: Record<Mark, string> = { done: "mark mark-ink", run: "mark mark-run", you: "mark mark-accent", idle: "mark mark-quiet", none: "mark opacity-0" };

export function StatusMark({ mark }: { mark: Mark }) {
  // sits on the first line of a title that wraps
  return <span className={`${markClass[mark]} mt-[7px]`} aria-hidden="true" />;
}

function Caret() {
  return (
    <svg className="caret mt-[5px]" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M4.5 2.5 L8 6 L4.5 9.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
    </svg>
  );
}

/**
 * One expandable line. It opens as `open` says on first render, then only when
 * a person clicks — a status change never snaps a node shut under them.
 */
export function Node({ title, meta, mark = "none", open = false, onOpen, children, id }: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  mark?: Mark;
  open?: boolean;
  onOpen?: () => void;
  children: React.ReactNode;
  id?: string;
}) {
  const [initial] = useState(open);
  return (
    <details className="node" open={initial} id={id} onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && onOpen?.()}>
      <summary className="-mx-1 flex items-start gap-2 rounded-sm px-1 py-1.5">
        <Caret />
        <StatusMark mark={mark} />
        <span className="min-w-0 flex-1">{title}</span>
        {meta && <span className="hidden shrink-0 text-right text-[13px] text-ink-3 sm:inline">{meta}</span>}
      </summary>
      <div className="kids space-y-0.5 pb-2 pt-0.5">{children}</div>
    </details>
  );
}

/** A line with nothing under it, aligned with the nodes around it. */
export function Leaf({ mark = "none", meta, children }: { mark?: Mark; meta?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <span className="w-3 shrink-0" aria-hidden="true" />
      <StatusMark mark={mark} />
      <span className="min-w-0 flex-1">{children}</span>
      {meta && <span className="hidden shrink-0 text-right text-[13px] text-ink-3 sm:inline">{meta}</span>}
    </div>
  );
}

/** A block of text inside a node: the spec, a packet's brief, a check's report. */
export function Body({ children }: { children: React.ReactNode }) {
  return <div className="space-y-2 py-2 text-[14px]">{children}</div>;
}

export function Pre({ children }: { children: React.ReactNode }) {
  return <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-sm bg-well p-3 font-mono text-[12px] leading-relaxed text-ink-2">{children}</pre>;
}

export const tokens = (n?: number) => (!n ? "" : n < 1000 ? `${n} tokens` : `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k tokens`);
