import type { Flight, Tone } from "@/lib/flight";

const toneVar: Record<Tone, string> = { blue: "var(--blue)", gold: "var(--gold)", red: "var(--red)", green: "var(--green)" };
const toneWord: Record<Tone, string> = { blue: "in progress", gold: "waiting on you", red: "needs your decision", green: "landed" };

/**
 * The one bold element: a single line from onboarding to landed with the arrow
 * where the work is now. It moves only when the work does.
 */
export function FlightPath({ flight }: { flight: Flight }) {
  const n = flight.stations.length;
  const step = 100 / n;
  const first = step / 2;
  const pos = first + flight.at * step;
  const color = toneVar[flight.tone];

  return (
    <div className="relative select-none" role="img" aria-label={`At ${flight.stations[flight.at].name}, ${toneWord[flight.tone]}`}>
      <div className="relative h-7">
        {/* the whole route, then the part already flown */}
        <div className="absolute top-3 h-px border-t border-dashed border-rule-strong" style={{ left: `${first}%`, right: `${first}%` }} />
        <div className="absolute top-[11px] h-[3px] rounded-full bg-ink transition-[width] duration-700 ease-out" style={{ left: `${first}%`, width: `${pos - first}%` }} />
        {flight.stations.map((_, i) => {
          const done = i < flight.at || (i === flight.at && flight.tone === "green");
          const here = i === flight.at;
          return (
            <span
              key={i}
              className="absolute top-3 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
              style={{
                left: `${first + i * step}%`,
                borderColor: here ? color : done ? "var(--ink)" : "var(--rule-strong)",
                background: here ? color : done ? "var(--ink)" : "var(--paper)",
              }}
            />
          );
        })}
        <svg
          className="absolute top-0 transition-[left] duration-700 ease-out"
          style={{ left: `calc(${pos}% - 36px)` }}
          width="30" height="24" viewBox="0 0 30 24" aria-hidden="true"
        >
          <path d="M2 12 H24" stroke={color} strokeWidth="3" strokeLinecap="round" />
          <path d="M18 5 L26 12 L18 19" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M2 12 L6 6 M2 12 L6 18" stroke={color} strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
      <ol className="mt-2 grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {flight.stations.map((st, i) => (
          <li key={st.name} className="px-1 text-center">
            <div className={`heading text-[13px] ${i === flight.at ? "text-ink" : i < flight.at ? "text-ink-2" : "text-ink-3"}`}>{st.name}</div>
            {st.detail && (
              <div className="mt-0.5 text-[12px] leading-snug text-ink-3" style={i === flight.at ? { color: flight.tone === "gold" ? "var(--gold-ink)" : color } : undefined}>
                {st.detail}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
