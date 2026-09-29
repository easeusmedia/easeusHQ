// The calendar's timeline: each task as a bar from the day work starts to
// the day it's due, stacked in as few rows (lanes) as fit without overlap.
// Pure, so the placing is testable on its own. Days are "yyyy-mm-dd".

export type Span = { start: string; end: string };

// Where a task sits in time: from its start (or the day it was made) to
// its due day (or delivery day); never ending before it starts.
export function spanOf(t: { start: string | null; created: string; due: string | null; delivery: string | null }): Span {
  const start = t.start ?? t.created;
  const end = t.due ?? t.delivery ?? start;
  return { start, end: end < start ? start : end };
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// the Monday of the week the day falls in
export function mondayOf(day: string): string {
  return addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7));
}

// how many days it spans, both ends counted
export function daysIn(s: Span): number {
  return Math.round((Date.parse(s.end) - Date.parse(s.start)) / 86_400_000) + 1;
}

// Each into the first lane whose last bar has ended before it starts,
// earliest first; a new lane only when none has room.
export function packLanes<T extends Span>(items: T[]): T[][] {
  const lanes: T[][] = [];
  const sorted = [...items].sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end));
  for (const item of sorted) {
    const lane = lanes.find((l) => l[l.length - 1].end < item.start);
    if (lane) lane.push(item);
    else lanes.push([item]);
  }
  return lanes;
}

// Work still open is still going on: a bar with no due day, or past it,
// runs on to today, and one past its due day is overdue.
export function stretchOpen(s: Span, due: string | null, today: string): Span & { overdue: boolean } {
  return { start: s.start, end: s.end < today ? today : s.end, overdue: !!due && due < today };
}
