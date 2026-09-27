import type { TaskNumbers } from "@/engine/metrics";

const caughtWords: Record<string, string> = {
  verification: "checks failed and were fixed before landing",
  scope: "changes went outside their packet or a house rule (size, docs, deps) and were re-aimed",
  protected: "tried to touch a protected path or add a secret",
  merge: "broke when combined with landed work",
  bad_check: "checks proved nothing and were re-aimed",
  environment: "install or sign-in problems",
  provider: "model provider outages (not counted against the code)",
  timeout: "ran out of time",
  bad_output: "unusable results, sent back",
  internal: "engine crashes, rerun",
};

const clock = (ms: number) => {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s` : `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`;
};

/** The numbers to put next to a plain agent run of the same task. */
export function TaskNumbersCard({ n }: { n: TaskNumbers }) {
  const cost = [n.cost.bobcoins ? `${n.cost.bobcoins} bobcoins` : "", n.cost.usd ? `$${n.cost.usd.toFixed(2)}` : ""].filter(Boolean).join(" + ") || "—";
  const caught = Object.entries(n.caught).sort((a, b) => b[1] - a[1]);
  return (
    <div className="rounded-lg border border-rule bg-panel px-5 py-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="heading text-[16px]">{n.done ? "Run summary" : "So far"}</h2>
        <span className="text-[13px] text-ink-3">from the event log</span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        <div>
          <dt className="text-[12px] text-ink-3">Total time</dt>
          <dd className="heading text-[20px]">{clock(n.wallMs)}</dd>
          <dd className="text-[12px] text-ink-3">{clock(n.waitingOnYouMs)} of it waiting on you</dd>
        </div>
        <div>
          <dt className="text-[12px] text-ink-3">Agent time</dt>
          <dd className="heading text-[20px]">{clock(n.agentMs)}</dd>
          <dd className="text-[12px] text-ink-3">summed, parallel runs overlap</dd>
        </div>
        <div>
          <dt className="text-[12px] text-ink-3">Tokens</dt>
          <dd className="heading text-[20px]">{n.tokens ? n.tokens.toLocaleString() : "—"}</dd>
        </div>
        <div>
          <dt className="text-[12px] text-ink-3">Cost</dt>
          <dd className="heading text-[20px]">{cost}</dd>
        </div>
      </dl>
      <div className="mt-4 border-t border-rule pt-3 text-[14px]">
        {caught.length === 0 ? (
          <p className="text-ink-2">Every house rule and company rule held on every packet — nothing had to be caught.</p>
        ) : (
          <>
            <p className="text-ink-2">Caught by Arrow before anything landed:</p>
            <ul className="mt-1 space-y-0.5">
              {caught.map(([c, k]) => (
                <li key={c}>
                  <span className="heading">{k}×</span> {caughtWords[c] ?? c}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
