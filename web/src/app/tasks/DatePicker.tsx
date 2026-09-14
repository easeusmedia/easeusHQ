"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
// Monday-first, like the rest of the team's week (and the reference the
// design is modelled on) — not the US Sunday-first default a raw
// Date.getDay() gives you.
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

type Ymd = { y: number; m: number; d: number }; // m is 1-12

// Everything here works on plain yyyy-mm-dd strings, never a Date parsed
// from one: `new Date("2026-09-20")` is parsed as UTC midnight and then
// rendered in local time, which silently shows the 19th for anyone behind
// UTC. Splitting the string keeps the date the user picked the date they
// see, everywhere, regardless of timezone.
function parse(value: string): Ymd | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function format(v: Ymd): string {
  return `${v.y}-${String(v.m).padStart(2, "0")}-${String(v.d).padStart(2, "0")}`;
}

function todayYmd(): Ymd {
  const now = new Date();
  return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
}

function sameDay(a: Ymd | null, b: Ymd | null) {
  return !!a && !!b && a.y === b.y && a.m === b.m && a.d === b.d;
}

function daysInMonth(y: number, m: number) {
  return new Date(y, m, 0).getDate(); // day 0 of next month = last day of this one
}

// Monday = 0 … Sunday = 6
function mondayIndex(y: number, m: number, d: number) {
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}

const ORDINAL = (d: number) => {
  if (d % 10 === 1 && d !== 11) return `${d}st`;
  if (d % 10 === 2 && d !== 12) return `${d}nd`;
  if (d % 10 === 3 && d !== 13) return `${d}rd`;
  return `${d}th`;
};

// "Thursday, 9th April" — the long, readable form the reference uses on
// the closed control, rather than a bare numeric date.
function longLabel(v: Ymd): string {
  const weekday = new Date(v.y, v.m - 1, v.d).toLocaleDateString("en-GB", { weekday: "long" });
  return `${weekday}, ${ORDINAL(v.d)} ${MONTHS[v.m - 1]}`;
}

// A calendar we draw ourselves, instead of <input type="date">. The native
// one can't be styled at all — its popup is drawn by the browser, so it
// lands as a bright white OS panel in the middle of a dark app no matter
// what CSS says (color-scheme: dark only gets it to the browser's *own*
// dark grey, not ours).
export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  clearable = true,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  clearable?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const selected = useMemo(() => parse(value), [value]);
  // the day highlighted inside the open calendar, which only becomes the
  // real value on "Choose date" — so browsing months (or clicking around)
  // can't change what's saved until it's confirmed
  const [draft, setDraft] = useState<Ymd | null>(selected);
  const [view, setView] = useState<{ y: number; m: number }>(() => {
    const base = selected ?? todayYmd();
    return { y: base.y, m: base.m };
  });

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const PANEL_HEIGHT = 380; // roughly the rendered popover, for the flip check

  function openPanel() {
    const base = selected ?? todayYmd();
    setDraft(selected);
    setView({ y: base.y, m: base.m });
    const rect = ref.current?.getBoundingClientRect();
    setOpenUpward(!!rect && window.innerHeight - rect.bottom < PANEL_HEIGHT && rect.top > PANEL_HEIGHT);
    setOpen(true);
  }

  function shiftMonth(by: number) {
    setView((v) => {
      const m = v.m + by;
      if (m < 1) return { y: v.y - 1, m: 12 };
      if (m > 12) return { y: v.y + 1, m: 1 };
      return { y: v.y, m };
    });
  }

  // 6 rows × 7 days, always — a grid that changes height month to month
  // makes the footer buttons jump around under the cursor.
  const cells = useMemo(() => {
    const lead = mondayIndex(view.y, view.m, 1);
    const total = daysInMonth(view.y, view.m);
    const prevTotal = daysInMonth(view.m === 1 ? view.y - 1 : view.y, view.m === 1 ? 12 : view.m - 1);
    const out: { ymd: Ymd; current: boolean }[] = [];
    for (let i = lead - 1; i >= 0; i--) {
      const y = view.m === 1 ? view.y - 1 : view.y;
      const m = view.m === 1 ? 12 : view.m - 1;
      out.push({ ymd: { y, m, d: prevTotal - i }, current: false });
    }
    for (let d = 1; d <= total; d++) out.push({ ymd: { y: view.y, m: view.m, d }, current: true });
    let next = 1;
    while (out.length < 42) {
      const y = view.m === 12 ? view.y + 1 : view.y;
      const m = view.m === 12 ? 1 : view.m + 1;
      out.push({ ymd: { y, m, d: next++ }, current: false });
    }
    return out;
  }, [view]);

  const today = todayYmd();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPanel())}
        className={`flex w-full items-center gap-2 rounded-lg border bg-surface-2 px-3 py-2.5 text-left text-sm ${
          open ? "border-blue-500" : "border-border"
        }`}
      >
        <CalendarDays size={15} className="shrink-0 text-muted" />
        <span className={`min-w-0 flex-1 truncate ${selected ? "text-foreground" : "text-muted"}`}>
          {selected ? longLabel(selected) : placeholder}
        </span>
      </button>

      {open && (
        <div
          className={`absolute left-0 z-30 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-3 shadow-2xl ${
            openUpward ? "bottom-full mb-2" : "mt-2"
          }`}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface-2 text-muted hover:text-foreground"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="text-sm font-semibold">
              {MONTHS[view.m - 1]} {view.y}
            </span>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label="Next month"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface-2 text-muted hover:text-foreground"
            >
              <ChevronRight size={15} />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-1">
            {WEEKDAYS.map((w) => (
              <span key={w} className="py-1 text-center text-xs font-medium text-muted">
                {w}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map(({ ymd, current }) => {
              const isSelected = sameDay(draft, ymd);
              const isToday = sameDay(today, ymd);
              return (
                <button
                  key={`${ymd.y}-${ymd.m}-${ymd.d}`}
                  type="button"
                  onClick={() => setDraft(ymd)}
                  className={`flex h-9 items-center justify-center rounded-md text-sm ${
                    isSelected
                      ? "bg-blue-600 font-medium text-white"
                      : current
                        ? "bg-surface-2 text-foreground hover:bg-hover"
                        : "text-muted/50 hover:bg-surface-2"
                  } ${isToday && !isSelected ? "ring-1 ring-blue-500/60" : ""}`}
                >
                  {ymd.d}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center gap-2">
            {clearable && value && (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className="btn-ghost rounded-lg px-3 py-2 text-sm"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="ml-auto rounded-lg border border-border bg-surface-2 px-4 py-2 text-sm text-muted hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!draft}
              onClick={() => {
                if (!draft) return;
                onChange(format(draft));
                setOpen(false);
              }}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              Choose date
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
