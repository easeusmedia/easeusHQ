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

import { handoffUnknown } from "./due.ts";
import { ACTIVE_STATUSES, type TaskStatus } from "./workflow.ts";
import { parseStageChange } from "./stages.ts";

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
  // client work: when it first reached the client, which is what its due
  // date is a deadline for (lib/due.ts). Null for someone's own work, which
  // is judged on when it was done.
  handedOffAt: Date | null;
  revisions: number;
  // client work rated S (gold) or A+ (green) by the quality inspection
  tier?: string | null;
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
//
// Client work is judged on the day it first reached the client, not the day
// it was delivered: the due date is the editor's deadline, and scoring it
// against delivery counted the client's review time against the editor.
export function onTime(item: HistoryItem): boolean | null {
  if (!item.dueDate) return null;
  // arrived from Notion already with the client: when it got there is
  // unknown, so it isn't scored either way
  if (handoffUnknown(item.createdAt, item.handedOffAt)) return null;
  return istDay(item.handedOffAt ?? item.completedAt) <= istDay(item.dueDate);
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

// ---------- Team work (team-work/) ----------
//
// Everyone's work in one place, a person at a time: what they're on now and
// everything they've finished, a window's worth at a time.

// What someone is working on now, as Home counts it (home/page.tsx onHome):
// a Level 3 only what's with them, Editing or back for a revision (Abhishek,
// 24 Oct 2026); anyone else all their open client work but Final export
// ready, which is their part done (23 Oct 2026)
export function currentStatuses(member: boolean): TaskStatus[] {
  return member ? ["editing", "revision_requested"] : ACTIVE_STATUSES.filter((s) => s !== "final_export_ready");
}

// What a Level 3 in Production is on right now (Abhishek, 26 Oct 2026):
// work still with them (a video queued, being edited or back for a revision;
// a to-do not done or waiting on someone) that is set for today, or already
// late. Anything set for a later day waits, whatever its stage; anything sent
// for approval, to the client or past them is the board's, not their list's.
// Work with no date shows only while they're actually on it (Editing, back
// for a revision, a to-do in progress).
export function inHand(item: { kind: "task" | "work"; status: string; due: string | null }, today: string): boolean {
  const withThem = item.kind === "task" ? ["queued", "editing", "revision_requested"].includes(item.status) : item.status === "todo" || item.status === "in_progress";
  if (!withThem) return false;
  if (item.due) return item.due <= today;
  return item.kind === "task" ? item.status !== "queued" : item.status === "in_progress";
}

// When the work began: its first move into Editing, else its first move into
// any other stage, else when it was made. A move into Delivered is the end,
// never the start: a to-do ticked done, or a task sent straight to Delivered,
// began when it was made
export function startOf(trail: { action: string; at: Date }[], createdAt: Date): Date {
  const moves = trail.flatMap((t) => {
    const to = parseStageChange(t.action)?.to;
    return to && to !== "delivered_and_uploaded" ? [{ to, at: t.at }] : [];
  });
  return (moves.find((m) => m.to === "editing") ?? moves[0])?.at ?? createdAt;
}

// How long something took: "3 days", or "5 h" under a day
export function spanLabel(ms: number): string {
  const hours = Math.max(0, ms) / HOUR;
  if (hours < 1) return "Under 1 h";
  if (Math.round(hours) < 24) return `${Math.round(hours)} h`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

// One finished task, as the list of someone's finished work is paged
export type Done = { kind: "task" | "work"; id: string; at: Date };

// A page of someone's finished work, newest first, finished within a range
// of days in India (yyyy-mm-dd, either end open), and how many the range holds
export function pageOfDone(done: Done[], { from, to, offset, limit }: { from?: string; to?: string; offset: number; limit: number }) {
  const shown = done
    .filter((d) => {
      const day = istDay(d.at);
      return (!from || day >= from) && (!to || day <= to);
    })
    .sort((a, b) => b.at.getTime() - a.at.getTime() || a.id.localeCompare(b.id));
  return { total: shown.length, page: shown.slice(offset, offset + limit) };
}

// A window's worth of rows: as many as fit in the space a list has on
// screen, and never fewer than ten (Abhishek, 26 Oct 2026)
export function windowful(spacePx: number, rowPx: number): number {
  return Math.max(10, Math.ceil(Math.max(0, spacePx) / rowPx));
}

// The stages a client task went through, oldest first: when it reached each,
// who moved it there (Notion for a sync's move, nobody where it started) and
// how long it stayed. The stage it's in now runs on to `now`; delivered is
// the end, with no time of its own.
export type Phase = { stage: string; at: Date; by: string | null; ms: number | null };
export function stagePhases(trail: { action: string; at: Date; by: string }[], createdAt: Date, status: string, now: Date): Phase[] {
  const moves = trail.flatMap((t) => {
    const change = parseStageChange(t.action);
    return change ? [{ from: change.from, stage: change.to, at: t.at, by: change.fromNotion ? "Notion" : t.by }] : [];
  });
  // an import can carry moves from before it was made here: it began at the first of them
  const began = moves[0] && moves[0].at < createdAt ? moves[0].at : createdAt;
  const steps = [{ stage: moves[0]?.from ?? status, at: began, by: null as string | null }, ...moves.map(({ stage, at, by }) => ({ stage, at, by }))];
  return steps.map((s, i) => ({
    ...s,
    ms: i + 1 < steps.length ? steps[i + 1].at.getTime() - s.at.getTime() : s.stage === "delivered_and_uploaded" ? null : now.getTime() - s.at.getTime(),
  }));
}
