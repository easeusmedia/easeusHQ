// The Email pages' charts, drawn as plain SVG and HTML on the server: a
// ring for a rate, bars for waits, a line for a count over time, and the
// week's hours as a heatmap. Each mark carries its number as a tooltip.

const ACCENT = "#4b95e6";
const EMERALD = "#34d399";

export const pct = (part: number, of: number) => (of ? Math.round((part / of) * 100) : 0);

// a change on the period before: +12% green, -34% red, 0% quiet
export function Change({ now, before }: { now: number; before: number }) {
  const d = before ? Math.round(((now - before) / before) * 100) : now ? 100 : 0;
  const tone = d > 0 ? "bg-emerald-400/15 text-emerald-300" : d < 0 ? "bg-rose-400/15 text-rose-300" : "bg-white/[0.06] text-muted";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ${tone}`}>{d > 0 ? `+${d}` : d}%</span>;
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
      <text x="50" y="49" textAnchor="middle" fontSize="17" fontWeight="600" fill="currentColor">
        {pct(part, of)}%
      </text>
      <text x="50" y="64" textAnchor="middle" fontSize="8.5" fill="currentColor" fillOpacity="0.55">
        {part}/{of}
      </text>
    </svg>
  );
}

// Counts in columns (waits, by bucket)
export function Bars({ labels, values, unit = "emails" }: { labels: string[]; values: number[]; unit?: string }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex h-40 items-end gap-1.5">
      {values.map((v, i) => (
        <div key={labels[i]} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5" title={`${labels[i]}: ${v} ${unit}`}>
          <span className="text-[10px] text-muted tabular-nums">{v || ""}</span>
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

// When emails go out: a row per weekday, a cell per hour, darker for more
export function Heatmap({ cells }: { cells: { dow: number; h: number; n: number }[] }) {
  const max = Math.max(1, ...cells.map((c) => c.n));
  const at = new Map(cells.map((c) => [`${c.dow}-${c.h}`, c.n]));
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[40rem] gap-[3px]" style={{ gridTemplateColumns: "2.5rem repeat(24, minmax(0, 1fr))" }}>
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="text-center text-[9px] text-muted tabular-nums">
            {h % 3 === 0 ? `${String(h).padStart(2, "0")}` : ""}
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
                  title={`${d} ${String(h).padStart(2, "0")}:00 · ${n} email${n === 1 ? "" : "s"}`}
                  className="h-5 rounded-[3px]"
                  style={{ background: n ? `rgba(52, 211, 153, ${0.15 + (n / max) * 0.75})` : "rgba(255, 255, 255, 0.04)" }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
