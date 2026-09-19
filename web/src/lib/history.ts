// The record of finished work, for both task systems at once.
//
// Two things produce completed work: the client editing queue (Task, which
// ends at "delivered and uploaded") and everyone's own work tasks (WorkTask,
// which end at "done"). History treats them as one list — "what did this
// company get done, and how fast" isn't a question about which board a job
// happened to live on.
//
// Pure on purpose: no database, no React. The page maps rows onto
// HistoryItem and everything below (turnaround, on-time, grouping, the
// per-person numbers) is arithmetic that can be tested on its own.

export type HistoryItem = {
  id: string;
  // the client pipeline, or someone's own work
  kind: "client" | "internal";
  title: string;
  personId: string;
  person: string;
  team: string | null;
  client: string | null;
  project: string | null;
  tags: string[];
  createdAt: Date;
  // when the work actually began (first move out of the queue), where known
  startedAt: Date | null;
  completedAt: Date;
  dueDate: Date | null;
  revisions: number;
};

const HOUR = 3_600_000;
const round1 = (n: number) => Math.round(n * 10) / 10;

// created → completed: how long the whole thing took, waiting included
export function turnaroundHours(item: HistoryItem): number {
  return round1(Math.max(0, item.completedAt.getTime() - item.createdAt.getTime()) / HOUR);
}

// started → completed: how long it took once someone picked it up. Null
// when nothing recorded a start, so averages skip it rather than counting a
// zero that would flatter the numbers.
export function activeHours(item: HistoryItem): number | null {
  if (!item.startedAt) return null;
  return round1(Math.max(0, item.completedAt.getTime() - item.startedAt.getTime()) / HOUR);
}

// Against its due date, in India — a date-only comparison, since a due date
// is a day, not a moment. Null when nothing was due.
export function onTime(item: HistoryItem): boolean | null {
  if (!item.dueDate) return null;
  return istDay(item.completedAt) <= istDay(item.dueDate);
}

export function istDay(d: Date): string {
  return new Date(d.getTime() + 5.5 * HOUR).toISOString().slice(0, 10);
}

export type Filters = {
  from?: string; // yyyy-mm-dd, on completion date
  to?: string;
  personId?: string;
  team?: string;
  client?: string;
  tag?: string;
  kind?: HistoryItem["kind"];
  search?: string;
};

export function filterHistory(items: HistoryItem[], f: Filters): HistoryItem[] {
  const needle = f.search?.trim().toLowerCase();
  return items.filter((i) => {
    const day = istDay(i.completedAt);
    if (f.from && day < f.from) return false;
    if (f.to && day > f.to) return false;
    if (f.personId && i.personId !== f.personId) return false;
    if (f.team && i.team !== f.team) return false;
    if (f.client && i.client !== f.client) return false;
    if (f.tag && !i.tags.includes(f.tag)) return false;
    if (f.kind && i.kind !== f.kind) return false;
    if (needle) {
      const hay = [i.title, i.person, i.client ?? "", i.project ?? "", ...i.tags].join(" ").toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

export type GroupBy = "person" | "team" | "client" | "tag" | "month" | "kind";

// What a task counts towards. Tags are the one that can be several at once
// — a reel that also needed a thumbnail counts under both.
function keysFor(item: HistoryItem, by: GroupBy): string[] {
  switch (by) {
    case "person":
      return [item.person];
    case "team":
      return [item.team ?? "No team"];
    case "client":
      return [item.client ?? "Internal"];
    case "tag":
      return item.tags.length ? item.tags : ["Untagged"];
    case "month":
      return [istDay(item.completedAt).slice(0, 7)];
    case "kind":
      return [item.kind === "client" ? "Client work" : "Own work"];
  }
}

export type SummaryRow = {
  key: string;
  completed: number;
  // the middle task, not the mean: one job left open over a holiday
  // shouldn't move the number everyone is judged by
  medianTurnaround: number;
  medianActive: number | null;
  revisionsPerTask: number;
  onTimePct: number | null;
  // how much lands in a typical week over the span actually worked
  perWeek: number;
  firstAt: Date;
  lastAt: Date;
};

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return round1(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2);
}

export function summarize(items: HistoryItem[], by: GroupBy): SummaryRow[] {
  const groups = new Map<string, HistoryItem[]>();
  for (const item of items) {
    for (const key of keysFor(item, by)) {
      const list = groups.get(key);
      if (list) list.push(item);
      else groups.set(key, [item]);
    }
  }

  const rows = [...groups.entries()].map(([key, group]) => {
    const times = group.map((g) => g.completedAt.getTime());
    const firstAt = new Date(Math.min(...times));
    const lastAt = new Date(Math.max(...times));
    const actives = group.map(activeHours).filter((h): h is number => h !== null);
    const rated = group.map(onTime).filter((v): v is boolean => v !== null);
    // at least a week, so a first task doesn't read as "20 a week"
    const weeks = Math.max(1, (lastAt.getTime() - firstAt.getTime()) / (7 * 24 * HOUR));
    return {
      key,
      completed: group.length,
      medianTurnaround: median(group.map(turnaroundHours)),
      medianActive: actives.length ? median(actives) : null,
      revisionsPerTask: round1(group.reduce((sum, g) => sum + g.revisions, 0) / group.length),
      onTimePct: rated.length ? Math.round((rated.filter(Boolean).length / rated.length) * 100) : null,
      perWeek: round1(group.length / weeks),
      firstAt,
      lastAt,
    };
  });

  // most finished work first; that's the question being asked of a summary
  return rows.sort((a, b) => b.completed - a.completed || a.key.localeCompare(b.key));
}

// The headline numbers above whatever is being shown.
export function totals(items: HistoryItem[]) {
  const rated = items.map(onTime).filter((v): v is boolean => v !== null);
  return {
    completed: items.length,
    people: new Set(items.map((i) => i.personId)).size,
    medianTurnaround: median(items.map(turnaroundHours)),
    revisionsPerTask: items.length ? round1(items.reduce((s, i) => s + i.revisions, 0) / items.length) : 0,
    onTimePct: rated.length ? Math.round((rated.filter(Boolean).length / rated.length) * 100) : null,
  };
}
