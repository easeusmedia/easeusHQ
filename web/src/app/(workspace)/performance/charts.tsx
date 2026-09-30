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

type Series = { name: string; color: string; values: (number | null)[] };

// Week by week on a 0–10 scale: a line per series, broken where a week has
// no score, and each week's number on its dot when `numbered`. Hover a
// week for `tip`.
function Lines({ series, spans, tip, numbered = false, height = 180 }: { series: Series[]; spans: { label: string }[]; tip: (i: number) => React.ReactNode; numbered?: boolean; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = spans.length;
  const x = (i: number) => (n < 2 ? 50 : 3 + (i / (n - 1)) * 94);
  const y = (v: number) => 100 - v * 10;
  const path = (values: (number | null)[]) =>
    values
      .map((v, i) => (v === null ? null : `${i && values[i - 1] !== null ? "L" : "M"}${x(i)},${y(v)}`))
      .filter(Boolean)
      .join(" ");

  return (
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
            setHover(n < 2 ? 0 : Math.max(0, Math.min(n - 1, Math.round(((at - 3) / 94) * (n - 1)))));
          }}
          onMouseLeave={() => setHover(null)}
        >
          {[0, 50, 100].map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-foreground/[0.06]" style={{ top: `${t}%` }} />
          ))}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1="0" y2="100" stroke="currentColor" className="text-foreground/20" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
            {series.map((s) => (
              <path key={s.name} d={path(s.values)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            ))}
          </svg>
          {series.map((s) =>
            s.values.map((v, i) =>
              v === null ? null : (
                <span key={`${s.name}${i}`} className="pointer-events-none absolute" style={{ left: `${x(i)}%`, top: `${y(v)}%` }}>
                  <span className={`absolute rounded-full ring-2 ring-surface transition-[width,height] duration-150 ${hover === i ? "size-3" : "size-2"}`} style={{ translate: "-50% -50%", background: s.color }} />
                  {numbered && <span className={`absolute bottom-2 -translate-x-1/2 text-sm tabular-nums ${hover === i ? "text-foreground" : "text-muted"}`}>{v}</span>}
                </span>
              )
            )
          )}
          {hover !== null && (
            <div className="absolute inset-y-0" style={{ left: `${x(hover)}%` }}>
              <Tip at={hover} n={n}>
                {tip(hover)}
              </Tip>
            </div>
          )}
        </div>
        <div className="relative h-5">
          {spans.map((c, i) => (
            <span
              key={c.label + i}
              className={`absolute -translate-x-1/2 text-sm whitespace-nowrap ${hover === i ? "text-foreground" : "text-muted"} ${i % 2 !== (n - 1) % 2 ? (n > 6 ? "max-sm:hidden" : "") + (n > 10 ? " max-lg:hidden" : "") : ""}`}
              style={{ left: `${x(i)}%` }}
            >
              {c.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export type SpanScore = { label: string; title: string; total: number | null; grade: Grade | null } & Record<Part, number | null>;

// One editor's total out of 10, week by week, each week's score on its
// dot. Hover a week for its three parts.
export function ScoreLine({ spans, max }: { spans: SpanScore[]; max: Record<Part, number> }) {
  if (!spans.some((s) => s.total !== null)) return <p className="py-10 text-center text-sm text-muted">No scores yet.</p>;
  return (
    <Lines
      series={[{ name: "Total", color: PART_COLOR.quantity, values: spans.map((s) => s.total) }]}
      spans={spans}
      numbered
      tip={(i) => {
        const s = spans[i];
        return (
          <>
            <p className="text-muted">{s.title}</p>
            {s.total === null ? (
              <p className="mt-1">No work tracked</p>
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
          </>
        );
      }}
    />
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

// Each editor's total out of 10, week by week, one line each. Hover a week
// for everyone's numbers.
export function TeamChart({ series, spans }: { series: EditorSeries[]; spans: { label: string; title: string }[] }) {
  if (!series.some((s) => s.values.some((v) => v !== null))) return <p className="py-10 text-center text-sm text-muted">No scores yet.</p>;
  const lines = series.map((s, k) => ({ ...s, color: LINE_COLORS[k % LINE_COLORS.length] }));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
        {lines.map((s) => (
          <span key={s.name} className="flex items-center gap-2">
            <span className="h-0.5 w-4 rounded-full" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
      <Lines
        series={lines}
        spans={spans}
        tip={(i) => (
          <>
            <p className="mb-1.5 text-muted">{spans[i].title}</p>
            {lines.map((s) => (
              <p key={s.name} className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: s.color }} />
                  <span className="truncate">{s.name}</span>
                </span>
                <span className="shrink-0 tabular-nums">{s.values[i] ?? "–"}</span>
              </p>
            ))}
          </>
        )}
      />
    </div>
  );
}
