"use client";

import { useEffect, useRef, useState } from "react";

export type Tab = { id: string; label: string; count?: number; you?: boolean };

/**
 * One page, one topic at a time. The open tab lives in the URL hash, so a link
 * or a reload lands on the same tab; arrow keys move between tabs.
 */
export function useTab(ids: string[], fallback: string) {
  const [tab, setTab] = useState(fallback);
  useEffect(() => {
    const h = window.location.hash.slice(1);
    if (ids.includes(h)) setTab(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const choose = (id: string) => {
    setTab(id);
    window.history.replaceState(null, "", `#${id}`);
  };
  return [tab, choose] as const;
}

export function TabBar({ tabs, current, onChange, label }: { tabs: Tab[]; current: string; onChange: (id: string) => void; label: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (i: number) => {
    const n = (i + tabs.length) % tabs.length;
    onChange(tabs[n].id);
    refs.current[n]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className="flex gap-6 overflow-x-auto border-b border-rule">
      {tabs.map((t, i) => {
        const on = t.id === current;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={on}
            aria-controls={`panel-${t.id}`}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") move(i + 1);
              if (e.key === "ArrowLeft") move(i - 1);
            }}
            className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 pb-2.5 pt-1 text-[14px] ${on ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink"}`}
          >
            {t.you && <span className="mark mark-accent" aria-label="waiting on you" />}
            <span className={on ? "heading" : ""}>{t.label}</span>
            {t.count !== undefined && <span className="text-[12px] text-ink-3">{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ id, current, children }: { id: string; current: string; children: React.ReactNode }) {
  if (id !== current) return null;
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} className="pt-6">
      {children}
    </div>
  );
}
