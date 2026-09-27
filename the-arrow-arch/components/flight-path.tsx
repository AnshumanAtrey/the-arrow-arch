import type { Flight, Tone } from "@/lib/flight";

// One accent: the arrow is ink while the crew is flying it, orange when it's waiting on you.
const toneVar: Record<Tone, string> = { blue: "var(--ink)", gold: "var(--accent)", red: "var(--accent)", green: "var(--ink)" };
const toneWord: Record<Tone, string> = { blue: "in progress", gold: "waiting on you", red: "needs your decision", green: "landed" };

/** The flight path's frame: the one band on the page with the orange crosshairs. */
export function FlightBand({ caption, children }: { caption?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="marked mt-8 rounded-sm bg-white px-3 pb-5 pt-5 sm:px-6">
      {caption && <p className="mb-5 text-[13px] text-ink-3">{caption}</p>}
      {children}
    </div>
  );
}

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
  const you = flight.tone === "gold" || flight.tone === "red";

  return (
    <div className="relative select-none" role="img" aria-label={`At ${flight.stations[flight.at].name}, ${toneWord[flight.tone]}`}>
      <div className="relative h-7">
        {/* the whole route, then the part already flown */}
        <div className="absolute top-3 h-px border-t border-dashed border-rule-strong" style={{ left: `${first}%`, right: `${first}%` }} />
        <div className="absolute top-[11px] h-[2px] bg-ink transition-[width] duration-700 ease-out" style={{ left: `${first}%`, width: `${pos - first}%` }} />
        {flight.stations.map((_, i) => {
          const done = i < flight.at || (i === flight.at && flight.tone === "green");
          const here = i === flight.at;
          // solid = decided or decision needed, ring = waiting on you, outline = still to come
          const fill = here ? (flight.tone === "gold" ? "var(--white)" : color) : done ? "var(--ink)" : "var(--white)";
          const edge = here ? color : done ? "var(--ink)" : "var(--rule-strong)";
          return (
            <span
              key={i}
              className={`absolute top-3 h-[11px] w-[11px] -translate-x-1/2 -translate-y-1/2 rounded-[1px] border-2 ${here && you ? "calling" : ""}`}
              style={{ left: `${first + i * step}%`, borderColor: edge, background: fill }}
            />
          );
        })}
        <svg
          className="absolute top-0 transition-[left] duration-700 ease-out"
          style={{ left: `calc(${pos}% - 38px)` }}
          width="30" height="24" viewBox="0 0 30 24" aria-hidden="true"
        >
          <path d="M2 12 H24" stroke={color} strokeWidth="2.5" strokeLinecap="square" />
          <path d="M18 5.5 L25 12 L18 18.5" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="square" strokeLinejoin="miter" />
          {/* fletching leans forward, so the tail never reads as a second head */}
          <path d="M1.5 7.5 L6 12 L1.5 16.5 M5.5 7.5 L10 12 L5.5 16.5" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="square" strokeLinejoin="miter" />
        </svg>
      </div>
      <ol className="mt-3 grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {flight.stations.map((st, i) => (
          <li key={st.name} className="px-1 text-center">
            <div className={`heading text-[13px] ${i === flight.at ? "text-ink" : i < flight.at ? "text-ink-2" : "text-ink-3"}`}>{st.name}</div>
            {st.detail && (
              <div className={`mt-0.5 text-[12px] leading-snug ${i === flight.at ? (you ? "text-accent-ink" : "text-ink-2") : "text-ink-3"}`}>
                {st.detail}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
