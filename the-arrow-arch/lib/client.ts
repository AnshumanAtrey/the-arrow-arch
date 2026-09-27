"use client";

import { useCallback, useEffect, useState } from "react";
import type { HouseSettings } from "@/engine/house-rules";
import type { Ledger } from "@/engine/ledger";
import type { Metrics, TaskNumbers } from "@/engine/metrics";
import type { ProjectState } from "@/engine/types";

export type Payload = { state: ProjectState; metrics: Metrics; ledger: Ledger | null; house: HouseSettings | null; numbers: Record<string, TaskNumbers> };

/** Poll a JSON endpoint. The orchestrator works in the background; the page just watches the log. */
export function usePoll<T>(url: string, ms = 1500) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await fetch(url, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? r.statusText);
      setData(j);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [url]);
  useEffect(() => {
    void load();
    const t = setInterval(load, ms);
    return () => clearInterval(t);
  }, [load, ms]);
  return { data, error, reload: load };
}

export async function act(pid: string, body: Record<string, unknown>) {
  const r = await fetch(`/api/projects/${pid}/actions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "That didn't go through. Try again.");
  return j as { ok: true; taskId?: string };
}

export function ago(iso?: string) {
  if (!iso) return "";
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export const duration = (ms?: number) =>
  ms === undefined ? "" : ms < 1000 ? `${ms}ms` : ms < 60_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 60_000)}m`;
