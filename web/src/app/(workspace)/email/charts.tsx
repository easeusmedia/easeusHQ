// The Email pages' charts, drawn as plain SVG and HTML on the server: a
// ring for a rate, bars for waits, a line for a count over time, and the
// week's hours as a heatmap. Each mark carries its number as a tooltip.

const ACCENT = "#4b95e6";
const EMERALD = "#34d399";

export const pct = (part: number, of: number) => (of ? Math.round((part / of) * 100) : 0);

// A change on the period before: ↗ +12% green, ↘ -34% red, = 0% quiet.
// Nothing before to compare with: no badge (a "+100%" from nothing says nothing).
export function Change({ now, before, against = "against the period before" }: { now: number; before: number; against?: string }) {
  if (!before) return null;
  const d = before ? Math.round(((now - before) / before) * 100) : 0;
  const tone = d > 0 ? "bg-emerald-400/15 text-emerald-300" : d < 0 ? "bg-rose-400/15 text-rose-300" : "bg-white/[0.06] text-muted";
  return (
    <span title={`${d > 0 ? "+" : ""}${d}% ${against} (${before} then)`} className={`rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ${tone}`}>
      {d > 0 ? `↗ +${d}` : d < 0 ? `↘ ${d}` : "= 0"}%
    </span>
  );
}

// A rate as a ring: the share lit, the percentage and "part/of" inside
export function Ring({ part, of, tone = "accent", size = 132 }: { part: number; of: number; tone?: "accent" | "emerald"; size?: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const share = of ? part / of : 0;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={`${pct(part, of)}%, ${part} of ${of}`}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeOpacity="0.08" strokeWidth="9" />
      {share > 0 && (
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={tone === "emerald" ? EMERALD : ACCENT}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${Math.max(share * c, 0.1)} ${c}`}
          transform="rotate(-90 50 50)"
        />
      )}
      {/* nothing to count yet: a dash, not a misleading 0% */}
      <text x="50" y="49" textAnchor="middle" fontSize="17" fontWeight="600" fill="currentColor" fillOpacity={of ? 1 : 0.5}>
        {of ? `${pct(part, of)}%` : "–"}
      </text>
      <text x="50" y="64" textAnchor="middle" fontSize="8.5" fill="currentColor" fillOpacity="0.55">
        {part}/{of}
      </text>
    </svg>
  );
}

// Counts in columns (waits, by bucket); nothing at all says so
export function Bars({ labels, values, unit = "emails", empty = "No data for this period", format = String }: { labels: string[]; values: number[]; unit?: string; empty?: string; format?: (n: number) => string }) {
  const max = Math.max(1, ...values);
  if (!values.some(Boolean)) return <p className="flex h-40 items-center justify-center text-sm text-muted">{empty}</p>;
  return (
    <div className="flex h-40 items-end gap-1.5">
      {values.map((v, i) => (
        <div key={labels[i]} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5" title={`${labels[i]}: ${v} ${unit}`}>
          <span className="text-[10px] text-muted tabular-nums">{v ? format(v) : ""}</span>
          <div className="w-full max-w-9 rounded-t-[4px] bg-accent/70" style={{ height: `${(v / max) * 100}%`, minHeight: v ? 3 : 0 }} />
          <span className="truncate text-[10px] text-muted">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

// A count over time: a line with a soft fill, and the busiest value marked
export function Trend({ points, tone = "accent", unit = "emails" }: { points: { label: string; value: number }[]; tone?: "accent" | "emerald"; unit?: string }) {
  const color = tone === "emerald" ? EMERALD : ACCENT;
  const w = 300;
  const h = 110;
  const max = Math.max(1, ...points.map((p) => p.value));
  const x = (i: number) => (points.length < 2 ? w / 2 : (i / (points.length - 1)) * w);
  const y = (v: number) => h - 6 - (v / max) * (h - 16);
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const id = `trend-${tone}`;
  const every = Math.max(1, Math.ceil(points.length / 6));
  if (!points.length) return <div className="flex h-36 items-center justify-center text-sm text-muted">No emails yet</div>;
  // one day has no line to draw: its count as a column
  if (points.length === 1) return <Bars labels={[points[0].label]} values={[points[0].value]} unit={unit} />;
  return (
    <div>
      <div className="mb-1 text-right text-[10px] text-muted tabular-nums">{max}</div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-28 w-full overflow-visible" preserveAspectRatio="none">
        <defs>
          <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.28" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="0" x2={w} y1={h - 6} y2={h - 6} stroke="currentColor" strokeOpacity="0.08" />
        <polygon points={`0,${h - 6} ${line} ${w},${h - 6}`} fill={`url(#${id})`} />
        <polyline points={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => (
          <rect key={p.label} x={x(i) - w / points.length / 2} y="0" width={w / points.length} height={h} fill="transparent">
            <title>{`${p.label}: ${p.value} ${unit}`}</title>
          </rect>
        ))}
      </svg>
      {/* each label under its own point (the last always shown, one too close to it left out) */}
      <div className="relative mt-1 h-4 text-[10px] text-muted">
        {points.map((p, i) => {
          const last = points.length - 1;
          if (i !== last && (i % every !== 0 || last - i < every)) return null;
          const at = (x(i) / w) * 100;
          return (
            <span key={p.label} className="absolute whitespace-nowrap" style={{ left: `${at}%`, transform: `translateX(-${at}%)` }}>
              {p.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const HEAT = { emerald: "52, 211, 153", accent: "75, 149, 230" };
const shade = (tone: keyof typeof HEAT, share: number) => (share ? `rgba(${HEAT[tone]}, ${0.15 + share * 0.75})` : "rgba(255, 255, 255, 0.04)");

// Less to more, for a heatmap's corner
export function HeatLegend({ tone = "emerald" }: { tone?: keyof typeof HEAT }) {
  return (
    <span className="flex items-center gap-1 text-[10px] text-muted">
      Less
      {[0, 0.25, 0.5, 0.75, 1].map((s) => (
        <span key={s} className="h-2.5 w-4 rounded-[2px]" style={{ background: shade(tone, s) }} />
      ))}
      More
    </span>
  );
}

// Emails by hour of the week: a row per weekday, a cell per hour, darker for more
export function Heatmap({ cells, tone = "emerald", noun = "email" }: { cells: { dow: number; h: number; n: number }[]; tone?: keyof typeof HEAT; noun?: string }) {
  const max = Math.max(1, ...cells.map((c) => c.n));
  const at = new Map(cells.map((c) => [`${c.dow}-${c.h}`, c.n]));
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[40rem] gap-[3px]" style={{ gridTemplateColumns: "2.5rem repeat(24, minmax(0, 1fr))" }}>
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="text-center text-[9px] text-muted tabular-nums">
            {h % 3 === 0 ? `${h}:00` : ""}
          </span>
        ))}
        {DAYS.map((d, dow) => (
          <div key={d} className="contents">
            <span className="text-[10px] leading-5 text-muted">{d}</span>
            {Array.from({ length: 24 }, (_, h) => {
              const n = at.get(`${dow}-${h}`) ?? 0;
              return (
                <span
                  key={h}
                  title={`${d} ${h}:00 to ${h + 1}:00: ${n} ${noun}${n === 1 ? "" : "s"}`}
                  className="h-5 rounded-[3px]"
                  style={{ background: shade(tone, n / max) }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// A rate against the period before, as Mailsuite draws it: for each period a
// column for all (sent) and inside it the share that did it (opened)
export function Compare({ periods, tone = "accent" }: { periods: { label: string; part: number; of: number }[]; tone?: "accent" | "emerald" }) {
  const max = Math.max(1, ...periods.map((p) => p.of));
  return (
    <div className="flex h-28 items-end justify-center gap-6">
      {periods.map((p, i) => (
        <div key={p.label} className="flex h-full w-20 flex-col items-center justify-end gap-1.5" title={`${p.label}: ${p.part} of ${p.of}`}>
          <span className="text-[10px] text-muted tabular-nums">
            {p.part}/{p.of}
          </span>
          <div className="relative w-10 rounded-t-[4px] bg-white/[0.08]" style={{ height: `${(p.of / max) * 100}%`, minHeight: 2 }}>
            <div className={`absolute inset-x-0 bottom-0 rounded-t-[4px] ${tone === "emerald" ? "bg-emerald-400/80" : "bg-accent/80"}`} style={{ height: p.of ? `${(p.part / p.of) * 100}%` : 0 }} />
          </div>
          <span className={`max-w-full truncate rounded-full px-2 py-0.5 text-[10px] ${i === periods.length - 1 ? "bg-white/[0.08] text-foreground" : "text-muted"}`}>{p.label}</span>
        </div>
      ))}
    </div>
  );
}
