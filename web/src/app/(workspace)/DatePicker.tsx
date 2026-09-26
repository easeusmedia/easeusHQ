"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { topLayer, useCloseOnScroll, usePopover } from "./popover";

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
// the closed control, rather than a bare numeric date. The year is added
// when it isn't this one: a joining date of "5th February" could be any year.
// "Fri 3 Oct" — what fits in a chip
function shortLabel(v: Ymd): string {
  const date = new Date(v.y, v.m - 1, v.d);
  const weekday = date.toLocaleDateString("en-GB", { weekday: "short" });
  const year = v.y === new Date().getFullYear() ? "" : ` ${v.y}`;
  return `${weekday} ${v.d} ${MONTHS[v.m - 1].slice(0, 3)}${year}`;
}

function longLabel(v: Ymd): string {
  const weekday = new Date(v.y, v.m - 1, v.d).toLocaleDateString("en-GB", { weekday: "long" });
  const year = v.y === new Date().getFullYear() ? "" : ` ${v.y}`;
  return `${weekday}, ${ORDINAL(v.d)} ${MONTHS[v.m - 1]}${year}`;
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
  pill,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  clearable?: boolean;
  // a compact chip instead of a full-width field — see Dropdown's own pill
  pill?: { icon?: React.ReactNode };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  // where the calendar goes: fixed to the window like the dropdowns (see
  // popover.ts), so a scrolling panel or dialog can't cut it off, and
  // nudged left when the field sits near the window's right edge
  const [shift, setShift] = useState(0);
  const [panelWidth, setPanelWidth] = useState(320);
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

  // the rendered calendar is 24rem tall; used to flip it above the field
  // when there's no room below, sitting right against it
  const rem = typeof window === "undefined" ? 16 : parseFloat(getComputedStyle(document.documentElement).fontSize);
  const { position, place } = usePopover(24 * rem);
  const close = useCallback(() => setOpen(false), []);
  useCloseOnScroll(open, close);

  function openPanel() {
    const base = selected ?? todayYmd();
    setDraft(selected);
    setView({ y: base.y, m: base.m });
    const trigger = triggerRef.current;
    if (!trigger) return;
    // 20rem, or the window less a margin on a phone
    const width = Math.min(20 * parseFloat(getComputedStyle(document.documentElement).fontSize), window.innerWidth - 16);
    const left = trigger.getBoundingClientRect().left;
    setPanelWidth(width);
    setShift(Math.max(8, Math.min(left, window.innerWidth - width - 8)) - left);
    place(trigger);
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
    <div ref={ref} className={pill ? "relative inline-block" : "relative"}>
      {pill ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => (open ? setOpen(false) : openPanel())}
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors duration-150 ${
            selected
              ? "border-border bg-surface-2 text-foreground hover:border-foreground/30"
              : "border-dashed border-border text-muted hover:border-foreground/30 hover:text-foreground"
          }`}
        >
          <span className="flex shrink-0 opacity-70">{pill.icon ?? <CalendarDays size={12} />}</span>
          <span className="whitespace-nowrap">{selected ? shortLabel(selected) : placeholder}</span>
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => (open ? setOpen(false) : openPanel())}
          // py-2, like a text input and a Dropdown, so a date field sits level
          // with the fields beside it in a form
          className={`flex w-full items-center gap-2 rounded-lg border bg-surface-2 px-3 py-2 text-left text-sm ${
            open ? "border-hover" : "border-border"
          }`}
        >
          <CalendarDays size={15} className="shrink-0 text-muted" />
          <span className={`min-w-0 flex-1 truncate ${selected ? "text-foreground" : "text-muted"}`}>
            {selected ? longLabel(selected) : placeholder}
          </span>
        </button>
      )}

      {open && position && (
        <div
          {...topLayer}
          style={{ top: position.top, bottom: position.bottom, left: position.left + shift, width: panelWidth }}
          className="pop-in fixed z-50 rounded-xl border border-border bg-surface p-3 shadow-2xl"
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
                      ? "bg-foreground font-medium text-background"
                      : current
                        ? "bg-surface-2 text-foreground hover:bg-hover"
                        : "text-muted/50 hover:bg-surface-2"
                  } ${isToday && !isSelected ? "ring-1 ring-muted/50" : ""}`}
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
                className="btn btn-sm btn-ghost"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="btn btn-sm ml-auto border border-border bg-surface-2 text-muted hover:text-foreground"
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
              className="btn btn-sm btn-glow disabled:opacity-50"
            >
              Choose date
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
