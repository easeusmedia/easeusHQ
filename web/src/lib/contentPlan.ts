import { DELIVERABLE_TYPES } from "./deliverableTypes.ts";

// A client's content blueprint: for each kind of deliverable a project can
// have, how many of it one project makes and on which days they're due,
// counted from the day the project starts. Creating a project lays its tasks
// out on the content calendar from this, so nobody writes nine tasks by hand
// for every episode; the calendar is where they get moved about afterwards.
//
// Pure (no database, no clock) so the arithmetic is testable on its own.

export type PlanItem = {
  type: string; // one of DELIVERABLE_TYPES
  count: number; // per project; 0 = this client doesn't get it
  startDay: number; // the first one is due this many days after the start
  everyDays: number; // and each after it this many days later
};

// Where every client starts (in DELIVERABLE_TYPES order): one episode's
// worth, the way a podcast client's fortnight runs — the edit and its thumbnail first, the trailer the day
// after, then the six clips every other day, and a bonus reel at the end.
export const DEFAULT_PLAN: PlanItem[] = [
  { type: "YouTube Long-Form", count: 1, startDay: 3, everyDays: 1 },
  { type: "Reel Trailer", count: 1, startDay: 4, everyDays: 1 },
  { type: "Reel", count: 6, startDay: 5, everyDays: 2 },
  { type: "Bonus Reel", count: 1, startDay: 17, everyDays: 1 },
  { type: "Thumbnails", count: 1, startDay: 3, everyDays: 1 },
];

const int = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;

// The plan in force: what's saved for the client, one row per deliverable
// type, in the usual order — anything missing or malformed falls back to the
// default, so a half-saved or older plan can never break project creation.
export function planFor(saved: unknown): PlanItem[] {
  const rows = Array.isArray(saved) ? (saved as Partial<PlanItem>[]) : [];
  return DELIVERABLE_TYPES.map((type) => {
    const d = DEFAULT_PLAN.find((p) => p.type === type)!;
    const s = rows.find((r) => r?.type === type);
    return s
      ? {
          type,
          count: int(s.count, 0, 30, d.count),
          startDay: int(s.startDay, 0, 365, d.startDay),
          everyDays: int(s.everyDays, 1, 60, d.everyDays),
        }
      : d;
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

// The tasks one new project gets: for each deliverable type picked for it,
// its count of tasks, dated from `start` by the plan. Soonest first.
export function planTasks(
  plan: PlanItem[],
  types: string[],
  projectName: string,
  start: string
): { title: string; type: string; due: string }[] {
  return plan
    .filter((p) => types.includes(p.type) && p.count > 0)
    .flatMap((p) =>
      Array.from({ length: p.count }, (_, i) => ({
        title: `${singular(p.type)}${p.count > 1 ? ` ${i + 1}` : ""} · ${projectName}`,
        type: p.type,
        due: addDays(start, p.startDay + i * p.everyDays),
      }))
    )
    .sort((a, b) => a.due.localeCompare(b.due));
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
