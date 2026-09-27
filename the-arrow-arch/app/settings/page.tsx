"use client";

import { useEffect, useState } from "react";
import type { Harness, RoleName, Settings } from "@/engine/settings";

type View = { settings: Omit<Settings, "keys"> & { keys: Record<string, string> }; bob: { installed: boolean; version: string } };

const roleWords: Record<RoleName, [string, string]> = {
  onboarder: ["Onboarder", "learns the repo and checks it against your rules"],
  pm: ["Project manager", "turns a task into a spec"],
  architect: ["Architect", "splits the spec into packets"],
  worker: ["Workers", "build one packet each, in parallel"],
};
const harnessWords: Record<Harness, string> = { bob: "IBM Bob Shell", claude: "Claude Code (your local login)", mock: "Mock — no model, for trying the flow" };

export default function SettingsPage() {
  const [view, setView] = useState<View | null>(null);
  const [roles, setRoles] = useState<Settings["roles"] | null>(null);
  const [bob, setBob] = useState<Settings["bob"] | null>(null);
  const [bobKey, setBobKey] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" }).then((r) => r.json()).then((v: View) => {
      setView(v);
      setRoles(v.settings.roles);
      setBob(v.settings.bob);
    });
  }, []);
  if (!view || !roles || !bob) return <p className="text-ink-3">Loading…</p>;

  async function save(extra: { keys?: Record<string, string | null> } = {}) {
    setState("saving");
    setError(null);
    try {
      const r = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roles, bob, keys: { BOB_API_KEY: bobKey, ...extra.keys } }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Settings weren't saved.");
      setView((v) => (v ? { ...v, settings: j.settings } : v));
      setBobKey("");
      setState("saved");
    } catch (e) {
      setError((e as Error).message);
      setState("idle");
    }
  }

  const usesBob = Object.values(roles).some((r) => r.harness === "bob");
  const keySet = view.settings.keys.BOB_API_KEY;

  return (
    <div className="max-w-3xl">
      <h1 className="display text-[36px] sm:text-[44px]">Settings</h1>
      <p className="measure mt-3 text-ink-2">Which engine each role runs on. Arrow ships with Bob Shell for every role; change a role only if you need to. Changes apply from the next step.</p>

      <section className="mt-10">
        <h2 className="heading mb-3 border-b border-rule pb-2 text-[18px]">Engines</h2>
        <ul className="divide-y divide-rule">
          {(Object.keys(roleWords) as RoleName[]).map((r) => (
            <li key={r} className="grid gap-2 py-3 sm:grid-cols-[1fr_18rem] sm:items-center">
              <div>
                <p className="heading text-[15px]">{roleWords[r][0]}</p>
                <p className="text-[13px] text-ink-3">{roleWords[r][1]}</p>
              </div>
              <select
                value={roles[r].harness}
                onChange={(e) => setRoles({ ...roles, [r]: { ...roles[r], harness: e.target.value as Harness } })}
                className="rounded-md border border-rule bg-panel px-3 py-2 text-[14px]"
                aria-label={`Engine for ${roleWords[r][0]}`}
              >
                {(Object.keys(harnessWords) as Harness[]).map((h) => <option key={h} value={h}>{harnessWords[h]}</option>)}
              </select>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="heading mb-3 border-b border-rule pb-2 text-[18px]">IBM Bob Shell</h2>
        <p className={`text-[14px] ${view.bob.installed ? "text-ink-2" : "text-red"}`}>
          {view.bob.installed ? `Installed: bob ${view.bob.version}` : "Bob Shell isn't installed on this machine. Install it from bob.ibm.com/docs/shell, then reload this page."}
        </p>
        <div className="mt-4 space-y-4">
          <label className="block">
            <span className="heading text-[14px]">API key</span>
            <span className="block text-[13px] text-ink-3">
              Needed to run Bob without a person at the keyboard. An inference key is best. {keySet ? `Saved (${keySet}).` : usesBob ? "Not set — Bob steps will pause until it is." : ""}
            </span>
            <input type="password" autoComplete="off" value={bobKey} onChange={(e) => setBobKey(e.target.value)} placeholder={keySet ? "Leave empty to keep the saved key" : "Paste your Bob API key"} className="mt-1.5 block w-full rounded-md border border-rule bg-panel px-3 py-2 font-mono text-[14px]" />
          </label>
          <label className="block max-w-sm">
            <span className="heading text-[14px]">Team ID</span>
            <span className="block text-[13px] text-ink-3">Only for a key of type &ldquo;general&rdquo;.</span>
            <input value={bob.teamId} onChange={(e) => setBob({ ...bob, teamId: e.target.value })} className="mt-1.5 block w-full rounded-md border border-rule bg-panel px-3 py-2 font-mono text-[14px]" />
          </label>
          <div className="flex flex-wrap gap-4">
            <label className="block w-44">
              <span className="heading text-[14px]">Max bobcoins per step</span>
              <input type="number" min={0} step="0.5" value={bob.maxCostPerRun ?? ""} onChange={(e) => setBob({ ...bob, maxCostPerRun: e.target.value ? Number(e.target.value) : undefined })} placeholder="no limit" className="mt-1.5 block w-full rounded-md border border-rule bg-panel px-3 py-2 text-[14px]" />
            </label>
            <label className="block w-44">
              <span className="heading text-[14px]">Max turns per step</span>
              <input type="number" min={0} value={bob.maxTurns ?? ""} onChange={(e) => setBob({ ...bob, maxTurns: e.target.value ? Number(e.target.value) : undefined })} placeholder="no limit" className="mt-1.5 block w-full rounded-md border border-rule bg-panel px-3 py-2 text-[14px]" />
            </label>
          </div>
          <label className="flex items-start gap-2 text-[14px]">
            <input type="checkbox" checked={bob.readersUseSubagents} onChange={(e) => setBob({ ...bob, readersUseSubagents: e.target.checked })} className="mt-1" />
            <span>Let the onboarder, project manager and architect use Bob&apos;s subagents to read in parallel. Workers never do — parallel writing is where agents collide.</span>
          </label>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="heading mb-3 border-b border-rule pb-2 text-[18px]">What agents get</h2>
        <p className="measure text-[14px] text-ink-2">
          Each agent runs with a clean environment: PATH, HOME, locale, its engine&apos;s own key, a PORT of its own, and only the variables its packet names. Nothing else from your shell reaches it. Keys are stored on this machine only, readable by you alone, and never shown back in full.
        </p>
      </section>

      <div className="mt-8 flex items-center gap-4">
        <button type="button" onClick={() => save()} disabled={state === "saving"} className="rounded-md bg-ink px-5 py-2.5 text-[15px] font-semibold text-paper disabled:opacity-50">
          {state === "saving" ? "Saving…" : "Save settings"}
        </button>
        {keySet && (
          <button type="button" onClick={() => save({ keys: { BOB_API_KEY: null } })} className="text-[14px] text-ink-2 underline decoration-rule-strong underline-offset-4 hover:text-ink">
            Remove the saved key
          </button>
        )}
        {state === "saved" && <p className="text-[14px] text-green">Saved. The next step uses these settings.</p>}
        {error && <p className="text-[14px] text-red" role="alert">{error}</p>}
      </div>
    </div>
  );
}
