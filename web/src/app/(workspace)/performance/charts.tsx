"use client";

import { useState } from "react";
import { GRADE_LABEL, type Grade, type Part } from "@/lib/editorKpi";
import { Info, PART, PART_COLOR } from "./ui";

const PARTS: Part[] = ["quantity", "quality", "rating"];
type Bands = Record<Exclude<Grade, "D">, number>;

// A small square of a series' colour, for legends and tooltips
const Swatch = ({ color }: { color: string }) => <span className="inline-block size-2 shrink-0 rounded-[2px]" style={{ background: color }} />;

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <Swatch color={i.color} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

// the grade lines across a 0–10 plot, quiet, labelled at the right
function GradeLines({ grades }: { grades: Bands }) {
  return (
    <>
      {(Object.keys(grades) as (keyof Bands)[]).map((g) => (
        <div key={g} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-foreground/[0.09]" style={{ bottom: `${grades[g] * 10}%` }}>
          <span className="absolute -top-2 right-0 translate-x-full pl-1.5 text-[10px] leading-none text-muted">{g}</span>
        </div>
      ))}
    </>
  );
}

// a tooltip over a mark, kept inside the chart at either end
function Tip({ at, n, children }: { at: number; n: number; children: React.ReactNode }) {
  const side = at < 2 ? "left-0" : at > n - 3 ? "right-0" : "left-1/2 -translate-x-1/2";
  return <div className={`pointer-events-none absolute bottom-full z-10 mb-2 w-48 rounded-xl popover px-3 py-2 text-xs shadow-lg ${side}`}>{children}</div>;
}

export type WeekScore = { label: string; total: number | null; grade: Grade | null; quantity: number | null; quality: number | null; rating: number | null };

// Week by week (or day by day, month by month): each bar the total out of
// 10, split into what Quantity, Quality and Rating gave it; the grade lines
// behind. Hover a bar for its numbers.
export function ScoreChart({ weeks, grades, max, height = 176 }: { weeks: WeekScore[]; grades: Bands; max: Record<Part, number>; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div>
      <Legend items={PARTS.map((p) => ({ label: PART[p].label, color: PART_COLOR[p] }))} />
      <div className="mt-4 mr-6 flex flex-col gap-2">
        <div className="relative" style={{ height }}>
          <GradeLines grades={grades} />
          <div className="absolute inset-0 flex items-end gap-1.5 border-b border-border sm:gap-3">
            {weeks.map((w, i) => {
              const got = PARTS.filter((p) => w[p] !== null);
              const sum = got.reduce((n, p) => n + w[p]!, 0);
              // a part left out is scaled over, so the bar stands at the total
              const scale = w.total !== null && sum ? w.total / sum : 0;
              return (
                <div key={i} className="relative flex h-full min-w-0 flex-1 flex-col justify-end" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                  {w.total === null ? (
                    <div className="h-[3px] rounded-t-sm bg-foreground/[0.07]" />
                  ) : (
                    <div className={`flex flex-col-reverse gap-[2px] transition-opacity duration-200 ${hover !== null && hover !== i ? "opacity-45" : ""}`}>
                      {got.map((p, j) => (
                        <div
                          key={p}
                          className={j === got.length - 1 ? "rounded-t-[4px]" : ""}
                          style={{ height: Math.max(1, ((w[p]! * scale) / 10) * height - (j ? 2 : 0)), background: PART_COLOR[p] }}
                        />
                      ))}
                    </div>
                  )}
                  {hover === i && (
                    <Tip at={i} n={weeks.length}>
                      <p className="text-muted">{w.label}</p>
                      {w.total === null ? (
                        <p className="mt-0.5">Nothing to score</p>
                      ) : (
                        <>
                          <p className="mt-0.5 mb-1.5 font-semibold text-foreground">
                            {w.total} / 10 · {w.grade} <span className="font-normal text-muted">{GRADE_LABEL[w.grade!]}</span>
                          </p>
                          {PARTS.map((p) => (
                            <p key={p} className="flex items-center justify-between gap-3">
                              <span className="flex items-center gap-1.5 text-muted">
                                <Swatch color={PART_COLOR[p]} />
                                {PART[p].label}
                              </span>
                              <span className="tabular-nums">
                                {w[p] ?? "–"} <span className="text-muted">/ {max[p]}</span>
                              </span>
                            </p>
                          ))}
                        </>
                      )}
                    </Tip>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex gap-1.5 sm:gap-3">
          {weeks.map((w, i) => (
            <span key={i} className={`min-w-0 flex-1 truncate text-center text-[10px] ${hover === i ? "text-foreground" : "text-muted"} ${weeks.length > 8 && i % 2 ? "max-sm:invisible" : ""}`}>
              {w.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export type MistakeRow = { category: string; description: string | null; count: number; repeats: number; videos: number };

// Mistakes by type, most first: each bar its count, the repeated share in
// its own colour. Hover a bar for the numbers.
export function MistakeBars({ rows }: { rows: MistakeRow[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const top = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="flex flex-col gap-3">
      <Legend
        items={[
          { label: "Mistakes", color: PART_COLOR.quantity },
          { label: "Repeated", color: PART_COLOR.rating },
        ]}
      />
      <ul className="flex flex-col gap-2.5">
        {rows.map((r) => (
          <li key={r.category} className="grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)_2rem] items-center gap-3 text-sm sm:grid-cols-[11rem_minmax(0,1fr)_2.5rem]">
            <span className="flex min-w-0 items-center gap-1">
              <span className="truncate">{r.category}</span>
              <Info label={r.category} text={r.description} />
            </span>
            <span className="relative flex h-5 items-center" onMouseEnter={() => setHover(r.category)} onMouseLeave={() => setHover(null)}>
              <span className="flex h-2.5 gap-[2px] transition-[width] duration-500" style={{ width: `${(r.count / top) * 100}%` }}>
                {r.count - r.repeats > 0 && <span className={`h-full ${r.repeats ? "rounded-l-[4px]" : "rounded-[4px]"}`} style={{ flex: r.count - r.repeats, background: PART_COLOR.quantity }} />}
                {r.repeats > 0 && <span className={`h-full ${r.count - r.repeats ? "rounded-r-[4px]" : "rounded-[4px]"}`} style={{ flex: r.repeats, background: PART_COLOR.rating }} />}
              </span>
              {hover === r.category && (
                <span className="popover pointer-events-none absolute bottom-full left-0 z-10 mb-1 rounded-lg px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lg">
                  {r.count} on {r.videos} video{r.videos === 1 ? "" : "s"}
                  {r.repeats ? <span className="text-muted"> · {r.repeats} repeated</span> : null}
                </span>
              )}
            </span>
            <span className="text-right tabular-nums">{r.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// the series' colours, in a fixed order that follows the editor, not their rank
const LINE_COLORS = ["#4b95e6", "#d95926", "#199e70", "#c98500", "#d55181", "#9085e9"];

export type EditorSeries = { name: string; values: (number | null)[] };

// Each editor's total out of 10, week by week, one line each, the grade
// lines behind. Hover anywhere for that week's numbers.
export function TeamChart({ series, labels, grades, height = 200 }: { series: EditorSeries[]; labels: string[]; grades: Bands; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = labels.length;
  const x = (i: number) => (n < 2 ? 50 : (i / (n - 1)) * 100);
  const y = (v: number) => 100 - v * 10;
  // a line broken where a week has no score
  const path = (values: (number | null)[]) =>
    values
      .map((v, i) => (v === null ? null : `${i && values[i - 1] !== null ? "L" : "M"}${x(i)},${y(v)}`))
      .filter(Boolean)
      .join(" ");
  // names at the ends of the lines, nudged apart when they'd overlap
  const ends = series
    .map((s, k) => ({ name: s.name, k, v: [...s.values].reverse().find((v) => v !== null) ?? null }))
    .filter((e) => e.v !== null)
    .sort((a, b) => b.v! - a.v!)
    .reduce<{ name: string; k: number; top: number }[]>((out, e) => {
      const want = y(e.v!);
      const top = out.length ? Math.max(want, out.at(-1)!.top + 9) : want;
      return [...out, { name: e.name, k: e.k, top }];
    }, []);

  return (
    <div>
      <Legend items={series.map((s, k) => ({ label: s.name, color: LINE_COLORS[k % LINE_COLORS.length] }))} />
      <div className="mt-4 mr-24 flex flex-col gap-2">
        <div
          className="relative"
          style={{ height }}
          onMouseMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            setHover(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - box.left) / box.width) * (n - 1)))));
          }}
          onMouseLeave={() => setHover(null)}
        >
          <GradeLines grades={grades} />
          <div className="absolute inset-x-0 bottom-0 border-b border-border" />
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1="0" y2="100" stroke="currentColor" className="text-foreground/25" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
            {series.map((s, k) => (
              <path key={s.name} d={path(s.values)} fill="none" stroke={LINE_COLORS[k % LINE_COLORS.length]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            ))}
          </svg>
          {series.map((s, k) =>
            s.values.map((v, i) =>
              v === null ? null : (
                <span
                  key={`${s.name}${i}`}
                  className={`pointer-events-none absolute rounded-full ring-2 ring-surface transition-[width,height] ${hover === i ? "size-2.5" : "size-2"}`}
                  style={{ left: `${x(i)}%`, top: `${y(v)}%`, translate: "-50% -50%", background: LINE_COLORS[k % LINE_COLORS.length] }}
                />
              )
            )
          )}
          {ends.map((e) => (
            <span key={e.name} className="pointer-events-none absolute left-full ml-3 max-w-20 -translate-y-1/2 truncate text-xs text-muted" style={{ top: `${e.top}%` }}>
              {e.name.split(" ")[0]}
            </span>
          ))}
          {hover !== null && (
            <div className="absolute inset-y-0" style={{ left: `${x(hover)}%` }}>
              <Tip at={hover} n={n}>
                <p className="mb-1.5 text-muted">{labels[hover]}</p>
                {series.map((s, k) => (
                  <p key={s.name} className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-1.5 text-muted">
                      <Swatch color={LINE_COLORS[k % LINE_COLORS.length]} />
                      <span className="truncate">{s.name}</span>
                    </span>
                    <span className="shrink-0 tabular-nums">{s.values[hover] ?? "–"}</span>
                  </p>
                ))}
              </Tip>
            </div>
          )}
        </div>
        <div className="relative h-3">
          {labels.map((l, i) => (
            <span
              key={i}
              className={`absolute -translate-x-1/2 text-[10px] whitespace-nowrap ${hover === i ? "text-foreground" : "text-muted"} ${n > 6 && i % 2 !== (n - 1) % 2 ? "max-sm:hidden" : ""}`}
              style={{ left: `${x(i)}%` }}
            >
              {l}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
