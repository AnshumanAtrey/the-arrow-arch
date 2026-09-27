"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const EXAMPLE = `- Never edit an applied migration in db/migrations/; add a new one instead
- Secrets and API keys never go in code or in commits
- API handlers live in src/api/, one file per resource
- React components use PascalCase file names
- Every change ships with a test`;

export default function Onboard() {
  const router = useRouter();
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [rulesText, setRules] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadFile(f: File | undefined) {
    if (!f) return;
    if (f.size > 200_000) return setError("That file is larger than 200 KB. Paste the rules that matter instead.");
    const text = await f.text();
    setRules((r) => (r.trim() ? `${r.trim()}\n${text}` : text));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repoUrl, branch: branch || undefined, rulesText }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Onboarding didn't start.");
      router.push(`/p/${j.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-3xl">
      <h1 className="display text-[36px] sm:text-[44px]">Onboard a repository</h1>
      <p className="measure mt-3 text-ink-2">
        Arrow copies the repo, learns how it&apos;s built and tested, and holds it up against your rules. Rules that could
        hurt data, money, security or production are marked critical. If one of those is at stake you&apos;ll get
        Arrow&apos;s call and what to do; if nothing is, it shows all green and waits for your approval.
      </p>

      <div className="mt-8 space-y-6">
        <label className="block">
          <span className="heading text-[15px]">Repository</span>
          <span className="block text-[13px] text-ink-3">A GitHub URL, or the absolute path to a git repo on this machine. Arrow never pushes.</span>
          <input
            required
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/acme/checkout-service"
            className="mt-2 block w-full rounded-md border border-rule bg-panel px-3 py-2.5 font-mono text-[14px]"
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        <label className="block max-w-xs">
          <span className="heading text-[15px]">Branch</span>
          <span className="block text-[13px] text-ink-3">Leave empty for the default branch.</span>
          <input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" className="mt-2 block w-full rounded-md border border-rule bg-panel px-3 py-2.5 font-mono text-[14px]" spellCheck={false} />
        </label>

        <div>
          <label htmlFor="rules" className="heading text-[15px]">Your team&apos;s rules</label>
          <p className="text-[13px] text-ink-3">
            Code style, file and folder structure, what must never change. One rule per line works best. You can also load a
            CONTRIBUTING.md or a rules file.
          </p>
          <textarea
            id="rules"
            value={rulesText}
            onChange={(e) => setRules(e.target.value)}
            rows={9}
            maxLength={20_000}
            placeholder={EXAMPLE}
            className="mt-2 block w-full rounded-md border border-rule bg-panel px-3 py-2.5 text-[14px] leading-relaxed"
          />
          <div className="mt-2 flex flex-wrap items-center gap-4 text-[13px]">
            <label className="cursor-pointer text-ink-2 underline decoration-rule-strong underline-offset-4 hover:text-ink">
              Load a rules file
              <input type="file" accept=".md,.txt,.markdown,text/plain,text/markdown" className="sr-only" onChange={(e) => loadFile(e.target.files?.[0])} />
            </label>
            {!rulesText && (
              <button type="button" onClick={() => setRules(EXAMPLE)} className="text-ink-2 underline decoration-rule-strong underline-offset-4 hover:text-ink">
                Use the example rules
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-8 flex items-center gap-4">
        <button type="submit" disabled={busy || !repoUrl.trim()} className="rounded-md bg-ink px-5 py-2.5 text-[15px] font-semibold text-paper disabled:opacity-50">
          {busy ? "Starting…" : "Start onboarding"}
        </button>
        {error && <p className="text-[14px] text-red" role="alert">{error}</p>}
      </div>
    </form>
  );
}
