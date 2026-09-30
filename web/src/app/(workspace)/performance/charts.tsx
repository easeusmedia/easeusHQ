"use client";

import { useState } from "react";
import { Repeat2 } from "lucide-react";
import { GRADE_LABEL, type Grade, type Part } from "@/lib/editorKpi";
import { Info, PART, PART_COLOR } from "./ui";

const PARTS: Part[] = ["quantity", "quality", "feedback"];

// a tooltip over a mark, kept inside the chart at either end
function Tip({ at, n, children }: { at: number; n: number; children: React.ReactNode }) {
  const side = n > 2 && at === 0 ? "left-0" : n > 2 && at === n - 1 ? "right-0" : "left-1/2 -translate-x-1/2";
  return <div className={`pointer-events-none absolute bottom-full z-10 mb-2 w-52 rounded-xl popover px-3.5 py-2.5 text-sm shadow-lg ${side}`}>{children}</div>;
}

// the leading weeks with nothing to score, dropped: they only push the rest off to one side
const trimmed = <T,>(xs: T[], empty: (x: T) => boolean) => {
  const first = xs.findIndex((x) => !empty(x));
  return first === -1 ? [] : xs.slice(first);
};

export type SpanScore = { label: string; title: string; total: number | null; grade: Grade | null } & Record<Part, number | null>;

// Each week's (or month's) total out of 10 as a bar with its number on
// top; the one being looked at is lit. Hover a bar for its three parts.
export function ScoreBars({ spans, max, height = 140 }: { spans: SpanScore[]; max: Record<Part, number>; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = trimmed(spans, (s) => s.total === null);
  if (!shown.length) return <p className="py-10 text-center text-sm text-muted">No scores yet.</p>;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-2 border-b border-border sm:gap-3" style={{ height: height + 24 }}>
        {shown.map((s, i) => (
          <div key={s.label + i} className="relative flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <span className={`text-sm tabular-nums ${i === shown.length - 1 || hover === i ? "text-foreground" : "text-muted"}`}>{s.total ?? ""}</span>
            <div
              className={`w-full max-w-12 rounded-t-[4px] transition-opacity duration-200 ${s.total === null ? "bg-foreground/[0.07]" : "bg-accent"} ${i === shown.length - 1 || hover === i ? "" : "opacity-45"}`}
              style={{ height: s.total === null ? 3 : Math.max(3, (s.total / 10) * height) }}
            />
            {hover === i && (
              <Tip at={i} n={shown.length}>
                <p className="text-muted">{s.title}</p>
                {s.total === null ? (
                  <p className="mt-1">Nothing to score</p>
                ) : (
                  <>
                    <p className="mt-0.5 mb-2 font-semibold text-foreground">
                      {s.grade} · {s.total} <span className="font-normal text-muted">{GRADE_LABEL[s.grade!]}</span>
                    </p>
                    {PARTS.map((p) => (
                      <p key={p} className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2 text-muted">
                          <span className="size-2 rounded-[2px]" style={{ background: PART_COLOR[p] }} />
                          {PART[p].label}
                        </span>
                        <span className="tabular-nums">
                          {s[p] ?? "–"}
                          <span className="text-muted"> / {max[p]}</span>
                        </span>
                      </p>
                    ))}
                  </>
                )}
              </Tip>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2 sm:gap-3">
        {shown.map((s, i) => (
          <span key={s.label + i} className={`min-w-0 flex-1 truncate text-center text-sm ${hover === i ? "text-foreground" : "text-muted"} ${shown.length > 6 && i % 2 !== (shown.length - 1) % 2 ? "max-sm:invisible" : ""}`}>
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export type MistakeRow = { category: string; description: string | null; count: number; repeats: number };

// Mistakes by type, most first: a bar and the count, and how many were repeats
export function MistakeBars({ rows }: { rows: MistakeRow[] }) {
  const top = Math.max(1, ...rows.map((r) => r.count));
  if (!rows.length) return <p className="py-10 text-center text-sm text-muted">No mistakes.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.category} className="flex flex-col gap-1.5">
          <span className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-1">
              <span className="truncate">{r.category}</span>
              <Info label={r.category} text={r.description} />
            </span>
            <span className="flex shrink-0 items-center gap-2.5 tabular-nums">
              {r.repeats > 0 && (
                <span className="flex items-center gap-1 text-rose-300" title={`${r.repeats} repeated`}>
                  <Repeat2 size={13} />
                  {r.repeats}
                </span>
              )}
              <span className="font-medium">{r.count}</span>
            </span>
          </span>
          <span className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.06]">
            <span className="block h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${(r.count / top) * 100}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

// the series' colours, in a fixed order that follows the editor, not their rank
const LINE_COLORS = ["#4b95e6", "#d95926", "#199e70", "#c98500", "#d55181", "#9085e9"];

export type EditorSeries = { name: string; values: (number | null)[] };

// Each editor's total out of 10, week by week, one line each. Hover
// anywhere for that week's numbers.
export function TeamChart({ series, spans, height = 180 }: { series: EditorSeries[]; spans: { label: string; title: string }[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  // from the first week anyone has a score
  const start = Math.max(0, spans.findIndex((_, i) => series.some((s) => s.values[i] !== null)));
  const cols = spans.slice(start);
  const lines = series.map((s) => ({ ...s, values: s.values.slice(start) }));
  const n = cols.length;
  if (!series.some((s) => s.values.some((v) => v !== null))) return <p className="py-10 text-center text-sm text-muted">No scores yet.</p>;
  const x = (i: number) => (n < 2 ? 50 : 4 + (i / (n - 1)) * 92);
  const y = (v: number) => 100 - v * 10;
  // a line broken where a week has no score
  const path = (values: (number | null)[]) =>
    values
      .map((v, i) => (v === null ? null : `${i && values[i - 1] !== null ? "L" : "M"}${x(i)},${y(v)}`))
      .filter(Boolean)
      .join(" ");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
        {lines.map((s, k) => (
          <span key={s.name} className="flex items-center gap-2">
            <span className="h-0.5 w-4 rounded-full" style={{ background: LINE_COLORS[k % LINE_COLORS.length] }} />
            {s.name}
          </span>
        ))}
      </div>
      <div className="flex gap-3">
        <div className="relative w-5 shrink-0 text-right text-sm text-muted tabular-nums" style={{ height }}>
          {[10, 5, 0].map((v) => (
            <span key={v} className="absolute right-0 -translate-y-1/2" style={{ top: `${y(v)}%` }}>
              {v}
            </span>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div
            className="relative"
            style={{ height }}
            onMouseMove={(e) => {
              const box = e.currentTarget.getBoundingClientRect();
              const at = ((e.clientX - box.left) / box.width) * 100;
              setHover(n < 2 ? 0 : Math.max(0, Math.min(n - 1, Math.round(((at - 4) / 92) * (n - 1)))));
            }}
            onMouseLeave={() => setHover(null)}
          >
            {[0, 50, 100].map((t) => (
              <div key={t} className="absolute inset-x-0 border-t border-foreground/[0.06]" style={{ top: `${t}%` }} />
            ))}
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
              {hover !== null && <line x1={x(hover)} x2={x(hover)} y1="0" y2="100" stroke="currentColor" className="text-foreground/20" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
              {lines.map((s, k) => (
                <path key={s.name} d={path(s.values)} fill="none" stroke={LINE_COLORS[k % LINE_COLORS.length]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              ))}
            </svg>
            {lines.map((s, k) =>
              s.values.map((v, i) =>
                v === null ? null : (
                  <span
                    key={`${s.name}${i}`}
                    className={`pointer-events-none absolute rounded-full ring-2 ring-surface transition-[width,height] duration-150 ${hover === i ? "size-3" : "size-2"}`}
                    style={{ left: `${x(i)}%`, top: `${y(v)}%`, translate: "-50% -50%", background: LINE_COLORS[k % LINE_COLORS.length] }}
                  />
                )
              )
            )}
            {hover !== null && (
              <div className="absolute inset-y-0" style={{ left: `${x(hover)}%` }}>
                <Tip at={hover} n={n}>
                  <p className="mb-1.5 text-muted">{cols[hover].title}</p>
                  {lines.map((s, k) => (
                    <p key={s.name} className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="size-2 shrink-0 rounded-full" style={{ background: LINE_COLORS[k % LINE_COLORS.length] }} />
                        <span className="truncate">{s.name}</span>
                      </span>
                      <span className="shrink-0 tabular-nums">{s.values[hover] ?? "–"}</span>
                    </p>
                  ))}
                </Tip>
              </div>
            )}
          </div>
          <div className="relative h-5">
            {cols.map((c, i) => (
              <span
                key={c.label + i}
                className={`absolute -translate-x-1/2 text-sm whitespace-nowrap ${hover === i ? "text-foreground" : "text-muted"} ${n > 6 && i % 2 !== (n - 1) % 2 ? "max-sm:hidden" : ""}`}
                style={{ left: `${x(i)}%` }}
              >
                {c.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
