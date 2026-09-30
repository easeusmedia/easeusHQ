"use client";

import { useState } from "react";
import Link from "next/link";
import { Repeat2 } from "lucide-react";
import { LETTER_LABEL, type Letter, type VideoScoring } from "@/lib/videoScore";
import { Info } from "./ui";

// a tooltip over a mark, kept inside the chart at either end
function Tip({ at, n, children }: { at: number; n: number; children: React.ReactNode }) {
  const side = n > 2 && at === 0 ? "left-0" : n > 2 && at === n - 1 ? "right-0" : "left-1/2 -translate-x-1/2";
  return <div className={`pointer-events-none absolute bottom-full z-10 mb-2 w-52 rounded-xl popover px-3.5 py-2.5 text-sm shadow-lg ${side}`}>{children}</div>;
}

type Series = { name: string; color: string; values: (number | null)[]; labels: (string | null)[] };
type Bands = VideoScoring["bands"];

// the letters' floors, down the side and across the plot
const FLOOR = 50;
const y = (v: number) => 100 - ((Math.max(FLOOR, Math.min(100, v)) - FLOOR) / (100 - FLOOR)) * 100;

// Week by week on the letters' scale (50 to 100, where C to S live): a
// line per series from the first week anyone has a score (the empty weeks
// before it say nothing), broken where a week has none, each week's letter
// (or number) on its dot. Hover a week for `tip`, given its index in the
// weeks passed in.
function Lines({ series: all, spans: allSpans, bands, tip, numbered = false, height = 190 }: { series: Series[]; spans: { label: string }[]; bands: Bands; tip: (i: number) => React.ReactNode; numbered?: boolean; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const start = Math.max(0, allSpans.findIndex((_, i) => all.some((s) => s.values[i] !== null)));
  const spans = allSpans.slice(start);
  const series = all.map((s) => ({ ...s, values: s.values.slice(start), labels: s.labels.slice(start) }));
  const n = spans.length;
  const x = (i: number) => (n < 2 ? 50 : 3 + (i / (n - 1)) * 94);
  const path = (values: (number | null)[]) =>
    values
      .map((v, i) => (v === null ? null : `${i && values[i - 1] !== null ? "L" : "M"}${x(i)},${y(v)}`))
      .filter(Boolean)
      .join(" ");
  const floors = (Object.entries(bands) as [Letter, number][]).filter(([, v]) => v >= FLOOR);

  return (
    <div className="flex gap-3">
      <div className="relative w-6 shrink-0 text-right text-xs font-medium text-muted" style={{ height }}>
        {floors.map(([l, v]) => (
          <span key={l} className="absolute right-0 -translate-y-1/2" style={{ top: `${y(v)}%` }}>
            {l}
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
          {floors.map(([l, v]) => (
            <div key={l} className="absolute inset-x-0 border-t border-foreground/[0.06]" style={{ top: `${y(v)}%` }} />
          ))}
          <div className="absolute inset-x-0 bottom-0 border-t border-border" />
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
                  {numbered && <span className={`absolute bottom-2 -translate-x-1/2 text-sm font-medium tabular-nums ${hover === i ? "text-foreground" : "text-muted"}`}>{s.labels[i]}</span>}
                </span>
              )
            )
          )}
          {hover !== null && (
            <div className="absolute inset-y-0" style={{ left: `${x(hover)}%` }}>
              <Tip at={hover} n={n}>
                {tip(hover + start)}
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

export type WeekScore = { label: string; title: string; score: number | null; letter: Letter | null; videos: number };

// One editor's weeks: the average of their videos' overall scores, a
// letter on each week's dot (the number too, for core). Hover for it.
export function WeeklyLine({ spans, bands, showScore }: { spans: WeekScore[]; bands: Bands; showScore: boolean }) {
  if (!spans.some((s) => s.score !== null)) return <p className="py-10 text-center text-sm text-muted">No graded videos yet.</p>;
  return (
    <Lines
      series={[{ name: "Overall", color: "#4b95e6", values: spans.map((s) => s.score), labels: spans.map((s) => (showScore && s.score !== null ? String(s.score) : s.letter)) }]}
      spans={spans}
      bands={bands}
      numbered
      tip={(i) => {
        const s = spans[i];
        return (
          <>
            <p className="text-muted">{s.title}</p>
            {s.score === null ? (
              <p className="mt-1">No graded videos</p>
            ) : (
              <p className="mt-0.5 font-semibold text-foreground">
                {s.letter}
                {showScore ? ` · ${s.score}` : ""} <span className="font-normal text-muted">{LETTER_LABEL[s.letter!]}</span>
              </p>
            )}
            <p className="mt-1 text-muted">
              {s.videos} video{s.videos === 1 ? "" : "s"}
            </p>
          </>
        );
      }}
    />
  );
}

export type MistakeRow = { category: string; description: string | null; count: number; repeats: number };

// Mistakes by type, most first: a bar and the count, how many were repeats;
// each opens the list of them, with their frames
// `href`: the page's own link to the Mistakes tab, which the type is added to
export function MistakeBars({ rows, href }: { rows: MistakeRow[]; href: string }) {
  const top = Math.max(1, ...rows.map((r) => r.count));
  if (!rows.length) return <p className="py-10 text-center text-sm text-muted">No mistakes.</p>;
  return (
    <ul className="flex flex-col gap-1">
      {rows.map((r) => (
        <li key={r.category}>
          <Link href={`${href}&type=${encodeURIComponent(r.category)}`} scroll={false} className="flex flex-col gap-1.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[0.03]">
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
          </Link>
        </li>
      ))}
    </ul>
  );
}

// the series' colours, in a fixed order that follows the editor, not their rank
const LINE_COLORS = ["#4b95e6", "#d95926", "#199e70", "#c98500", "#d55181", "#9085e9"];

export type EditorSeries = { name: string; values: (number | null)[]; letters: (Letter | null)[] };

// Each editor's weeks, one line each, on the letters' scale. Hover a week
// for everyone's.
export function TeamChart({ series, spans, bands, showScore }: { series: EditorSeries[]; spans: { label: string; title: string }[]; bands: Bands; showScore: boolean }) {
  if (!series.some((s) => s.values.some((v) => v !== null))) return <p className="py-10 text-center text-sm text-muted">No graded videos yet.</p>;
  const lines = series.map((s, k) => ({ ...s, color: LINE_COLORS[k % LINE_COLORS.length], labels: s.letters }));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
        {lines.map((s) => (
          <span key={s.name} className="flex items-center gap-2">
            <span className="size-2.5 rounded-full" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
      <Lines
        series={lines}
        spans={spans}
        bands={bands}
        numbered
        tip={(i) => (
          <>
            <p className="mb-1.5 text-muted">{spans[i].title}</p>
            {lines.map((s) => (
              <p key={s.name} className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: s.color }} />
                  <span className="truncate">{s.name}</span>
                </span>
                {s.letters[i] ? (
                  <span className="shrink-0 tabular-nums">
                    {s.letters[i]}
                    {showScore && s.values[i] !== null ? ` · ${s.values[i]}` : ""}
                  </span>
                ) : (
                  <span className="shrink-0 text-muted">No videos</span>
                )}
              </p>
            ))}
          </>
        )}
      />
    </div>
  );
}
