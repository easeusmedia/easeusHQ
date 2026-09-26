import { DELIVERABLE_TYPES } from "./deliverableTypes.ts";

// A client's content blueprint: for each kind of deliverable a project can
// have, how many of it one project makes and when they're worked on and due
// — laid out over a one-week project. A project with a longer or shorter
// deadline gets the same shape stretched or squeezed to fit. Creating a
// project lays its tasks out on the content calendar from this, so nobody
// writes nine tasks by hand for every episode; the calendar is where they're
// moved about afterwards.
//
// Pure (no database, no clock) so the arithmetic is testable on its own.

// the length of project the blueprint is written for
export const PLAN_DAYS = 7;

export type PlanItem = {
  type: string; // one of DELIVERABLE_TYPES
  count: number; // per project; 0 = this client doesn't get it
  startDay: number; // work on them starts this many days in
  endDay: number; // and the last is due this many days in; the rest are spread evenly before it
};

// Where every client starts (in DELIVERABLE_TYPES order): the trailer in the
// first two days, the reels spread over the rest of the week after it, the
// long-form edit and its thumbnail alongside.
export const DEFAULT_PLAN: PlanItem[] = [
  { type: "YouTube Long-Form", count: 1, startDay: 0, endDay: 5 },
  { type: "Reel Trailer", count: 1, startDay: 0, endDay: 2 },
  { type: "Reel", count: 6, startDay: 2, endDay: 7 },
  { type: "Bonus Reel", count: 0, startDay: 5, endDay: 7 },
  { type: "Thumbnails", count: 1, startDay: 3, endDay: 5 },
];

const int = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;

// The plan in force: what's saved for the client, one row per deliverable
// type, in the usual order — anything missing or malformed falls back to the
// default, so a half-saved or older plan can never break project creation.
// A plan saved before ranges ("first on day N, then every M days") is read
// as the range those dates covered.
export function planFor(saved: unknown): PlanItem[] {
  const rows = Array.isArray(saved) ? (saved as (Partial<PlanItem> & { everyDays?: number })[]) : [];
  return DELIVERABLE_TYPES.map((type) => {
    const d = DEFAULT_PLAN.find((p) => p.type === type)!;
    const s = rows.find((r) => r?.type === type);
    if (!s) return d;
    const count = int(s.count, 0, 30, d.count);
    const startDay = int(s.startDay, 0, 365, d.startDay);
    const legacyEnd =
      s.endDay === undefined && typeof s.everyDays === "number" ? startDay + Math.max(0, count - 1) * s.everyDays : undefined;
    const endDay = Math.max(startDay, int(s.endDay ?? legacyEnd, 0, 365, Math.max(startDay, d.endDay)));
    return { type, count, startDay, endDay };
  });
}

// the "Type of work" a planned task gets, where there's one that fits
export const TYPE_TAG: Record<string, string> = {
  "Reel Trailer": "Trailer",
  Reel: "Reel",
  "Bonus Reel": "Reel",
  Thumbnails: "Thumbnail",
};

// what one of them is called on its task: "Thumbnail", not "Thumbnails"
const singular = (type: string) => (type === "Thumbnails" ? "Thumbnail" : type);

// yyyy-mm-dd plus n days, in plain calendar arithmetic
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// days from one yyyy-mm-dd to another
export const daysApart = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

// The tasks one new project gets: for each deliverable type picked for it,
// its count of tasks, each with the day work on it starts and the day it's
// due — the blueprint's week fitted to the project's own start and deadline.
// Several of one kind are due evenly through their range, each one's work
// starting where the one before it was due. Soonest due first.
export function planTasks(
  plan: PlanItem[],
  types: string[],
  projectName: string,
  start: string,
  deadline: string = addDays(start, PLAN_DAYS)
): { title: string; type: string; start: string; due: string }[] {
  const scale = Math.max(1, daysApart(start, deadline)) / PLAN_DAYS;
  return plan
    .filter((p) => types.includes(p.type) && p.count > 0)
    .flatMap((p) => {
      const s = Math.round(p.startDay * scale);
      const e = Math.max(s, Math.round(p.endDay * scale));
      const due = Array.from({ length: p.count }, (_, i) => (p.count === 1 ? e : s + Math.round(((i + 1) * (e - s)) / p.count)));
      return due.map((d, i) => ({
        title: `${singular(p.type)}${p.count > 1 ? ` ${i + 1}` : ""} · ${projectName}`,
        type: p.type,
        start: addDays(start, i === 0 ? s : due[i - 1]),
        due: addDays(start, d),
      }));
    })
    .sort((a, b) => a.due.localeCompare(b.due) || a.start.localeCompare(b.start));
}

// A month as the calendar draws it: whole weeks, Monday first, as yyyy-mm-dd
// — the days either side of the month fill out the first and last week.
export function monthGrid(year: number, month: number): string[][] {
  const first = new Date(Date.UTC(year, month, 1));
  const lead = (first.getUTCDay() + 6) % 7; // days back to Monday
  const start = addDays(first.toISOString().slice(0, 10), -lead);
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const weeks = Math.ceil((lead + days) / 7);
  return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
}

// For one week (seven days, Monday first): every item that falls in it, as a
// bar — which column it starts in, how many days it runs, whether it really
// starts or ends inside this week — and the row it sits on, so no two bars
// overlap. Earlier starts and longer spans get the upper rows.
export function weekLanes<T extends { start: string; due: string }>(
  week: string[],
  items: T[]
): { placed: { item: T; col: number; span: number; lane: number; startsHere: boolean; endsHere: boolean }[]; lanes: number } {
  const [first, last] = [week[0], week[6]];
  const hits = items
    .map((item) => ({ item, start: item.start <= item.due ? item.start : item.due, due: item.due }))
    .filter((x) => x.start <= last && x.due >= first)
    .sort((a, b) => a.start.localeCompare(b.start) || b.due.localeCompare(a.due));
  const ends: string[] = []; // the last day taken in each row
  const placed = hits.map((x) => {
    const s = x.start < first ? first : x.start;
    const e = x.due > last ? last : x.due;
    let lane = ends.findIndex((end) => end < s);
    if (lane === -1) lane = ends.push(e) - 1;
    else ends[lane] = e;
    const col = week.indexOf(s);
    return { item: x.item, col, span: week.indexOf(e) - col + 1, lane, startsHere: x.start >= first, endsHere: x.due <= last };
  });
  return { placed, lanes: ends.length };
}
