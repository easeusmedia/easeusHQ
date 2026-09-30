// The building blocks editors' work is read with: days and hours in India,
// the kind of each video, its stage changes, repeated mistakes, and the
// periods the Performance pages show (a week, a month, a range, all time).
// How a video is scored lives in videoScore.ts.
//
// Pure (no database, no React) so all of it is testable on its own.

// what a feedback entry can be
export const ENTRY_KINDS = { mistake: "Mistake", creative: "Creative change", positive: "Praise", negative: "Concern", guidance: "Tip" } as const;

// ---------- days and hours (India, +5:30 all year) ----------

const HOUR = 3_600_000;
const DAY = 86_400_000;
const IST = 5.5 * HOUR;
const round1 = (n: number) => Math.round(n * 10) / 10;

export const dayOf = (d: Date) => new Date(d.getTime() + IST).toISOString().slice(0, 10);
export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
export const weekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);

export const isWorkDay = (day: string, s: { workDays: number[] }) => s.workDays.includes(weekday(day));

// "3.5h", "1.5 days"
export const hoursLabel = (h: number) => (h >= 24 ? `${round1(h / 24)} day${h === 24 ? "" : "s"}` : `${round1(h)}h`);

// ---------- the kind of video ----------

// Older tasks have no type: guessed from the title, then taken as a reel.
const GUESSES: [RegExp, string][] = [
  [/trailer/i, "Trailer"],
  [/podcast|episode|\bep\.?\s*\d|long[- ]?form|full (video|episode)/i, "Podcast editing"],
  [/\breels?\b|\bshorts?\b/i, "Reel"],
];

export function workType(tags: string[], title: string, s: { types: Record<string, unknown> }): { type: string; guessed: boolean } {
  const tagged = tags.find((x) => x in s.types) ?? tags[0];
  if (tagged) return { type: tagged, guessed: false };
  return { type: GUESSES.find(([re]) => re.test(title))?.[1] ?? "Reel", guessed: true };
}

// ---------- one video ----------

export type Move = { at: Date; from: string; to: string };

const UNDO_WINDOW = 2 * 60_000;

// A stage clicked by mistake and put straight back isn't a stage the work
// went through: a move reversed within two minutes cancels out, in pairs,
// so a slip onto "Revision requested" doesn't count as a revision.
// ponytail: a real revision undone inside two minutes is lost too; fine at
// this team's pace.
export function settle(moves: Move[]): Move[] {
  const kept: Move[] = [];
  for (const m of moves) {
    const last = kept.at(-1);
    if (last && last.from === m.to && last.to === m.from && m.at.getTime() - last.at.getTime() < UNDO_WINDOW) kept.pop();
    else kept.push(m);
  }
  return kept;
}

// times it was sent back: by our review, or after it had gone to the client
export function sentBack(moves: Move[]) {
  const back = moves.filter((m) => m.to === "revision_requested");
  const internal = back.filter((m) => m.from === "sent_for_approval").length;
  return { internal, client: back.length - internal };
}

// ---------- repeated mistakes ----------

export const REPEAT_DAYS = 90;

// Which mistakes repeat an earlier one: the same type, on a
// different video, within 90 days before it. (Two typos in one cut are two
// mistakes, not a repeat; a typo in the next video is.) Ids of the repeats.
export function repeats(points: { id: string; category: string; taskId: string | null; at: Date }[]): Set<string> {
  const out = new Set<string>();
  const sorted = [...points].sort((a, b) => a.at.getTime() - b.at.getTime());
  sorted.forEach((p, i) => {
    const since = p.at.getTime() - REPEAT_DAYS * DAY;
    if (sorted.slice(0, i).some((q) => q.category === p.category && q.at.getTime() >= since && (q.taskId === null || p.taskId === null || q.taskId !== p.taskId))) out.add(p.id);
  });
  return out;
}

// ---------- periods ----------

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-09" moved by whole months
export function shiftMonth(ym: string, by: number): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
}
export const monthName = (ym: string, year = true) => `${MONTHS[Number(ym.slice(5, 7)) - 1]}${year ? ` ${ym.slice(0, 4)}` : ""}`;
export const daysInMonth = (ym: string) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();
export const shortDay = (day: string) => `${Number(day.slice(8, 10))} ${SHORT[Number(day.slice(5, 7)) - 1]}`;
export const mondayOf = (day: string) => addDays(day, -((weekday(day) + 6) % 7));

// "22–28 Sep", "29 Sep – 5 Oct"
export function spanLabel(from: string, to: string) {
  if (from === to) return shortDay(from);
  return from.slice(0, 7) === to.slice(0, 7) ? `${Number(from.slice(8))}–${shortDay(to)}` : `${shortDay(from)} – ${shortDay(to)}`;
}

export type PeriodKind = "week" | "month" | "range" | "all";
export type Period = {
  kind: PeriodKind;
  from: string;
  // the last day it covers so far: today, for one under way
  to: string;
  label: string;
  current: boolean;
  // the one before it, the same length, for the change
  prev: { from: string; to: string };
};

const isDay = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

// The period a page is showing, from its query: a week (any day in it), a
// month, a range of days, or all of it since `first` (the first day
// anything was recorded). Never in the future; a range is at most a year,
// and an unreadable one falls back to the last 30 days.
export function periodFrom(q: { view?: string; week?: string; month?: string; from?: string; to?: string }, today: string, first?: string): Period {
  if (q.view === "all") {
    const from = first && first < today ? first : addDays(today, -89);
    // nothing before all of it: compared with itself, so no change shows
    return { kind: "all", from, to: today, label: "All time", current: true, prev: { from, to: today } };
  }
  if (q.view === "month") {
    const thisMonth = today.slice(0, 7);
    const ym = q.month && /^\d{4}-\d{2}$/.test(q.month) && q.month <= thisMonth ? q.month : thisMonth;
    const end = `${ym}-${String(daysInMonth(ym)).padStart(2, "0")}`;
    const before = shiftMonth(ym, -1);
    return {
      kind: "month",
      from: `${ym}-01`,
      to: end < today ? end : today,
      label: monthName(ym),
      current: ym === thisMonth,
      prev: { from: `${before}-01`, to: `${before}-${String(daysInMonth(before)).padStart(2, "0")}` },
    };
  }
  if (q.view === "range") {
    let from = isDay(q.from) ? q.from : addDays(today, -29);
    let to = isDay(q.to) ? q.to : today;
    if (to > today) to = today;
    if (from > to) [from, to] = [to, from];
    if (daysBetween(from, to) > 365) from = addDays(to, -365);
    const length = daysBetween(from, to) + 1;
    return { kind: "range", from, to, label: `${spanLabel(from, to)} ${to.slice(0, 4)}`, current: to === today, prev: { from: addDays(from, -length), to: addDays(from, -1) } };
  }
  const anchor = isDay(q.week) && q.week <= today ? q.week : today;
  const monday = mondayOf(anchor);
  const sunday = addDays(monday, 6);
  return {
    kind: "week",
    from: monday,
    to: sunday < today ? sunday : today,
    label: spanLabel(monday, sunday),
    current: sunday >= today,
    prev: { from: addDays(monday, -7), to: addDays(monday, -1) },
  };
}

export type Span = { from: string; to: string; label: string; title: string };

// The weeks or months leading up to and including the one holding `to`,
// oldest first: "22 Sep" or "Sep" to label a chart, and the whole span for
// its tooltip.
export function trendSpans(kind: "week" | "month", to: string, n: number): Span[] {
  if (kind === "month") {
    const ym = to.slice(0, 7);
    return Array.from({ length: n }, (_, i) => {
      const m = shiftMonth(ym, i - (n - 1));
      const end = `${m}-${String(daysInMonth(m)).padStart(2, "0")}`;
      return { from: `${m}-01`, to: end < to ? end : to, label: monthName(m, false).slice(0, 3), title: monthName(m) };
    });
  }
  const monday = mondayOf(to);
  return Array.from({ length: n }, (_, i) => {
    const from = addDays(monday, -7 * (n - 1 - i));
    const sunday = addDays(from, 6);
    return { from, to: sunday < to ? sunday : to, label: shortDay(from), title: spanLabel(from, sunday) };
  });
}

// The weeks a period's chart shows, week by week: the 12 up to its end, or
// every week of a longer stretch (up to a year).
export function chartSpans(p: Pick<Period, "from" | "to">): Span[] {
  const weeks = Math.ceil((daysBetween(mondayOf(p.from), p.to) + 1) / 7);
  return trendSpans("week", p.to, Math.min(52, Math.max(12, weeks)));
}
