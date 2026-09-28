// An editor's month, as the numbers ops runs the editing team on: how much
// shipped, whether it reached the client on time, whether it got through
// review without being sent back, and how long a first draft took.
//
// Pure (no database, no React) so the scoring is testable on its own; the
// Performance page maps delivered tasks and their stage history onto KpiTask.

import { onTime } from "./history.ts";

export type KpiTask = {
  title: string;
  createdAt: Date;
  deliveredAt: Date;
  dueDate: Date | null;
  handedOffAt: Date | null;
  tags: string[];
  // stage changes, oldest first
  moves: { at: Date; from: string; to: string }[];
};

export type Targets = {
  delivered: number; // videos a month
  onTimePct: number;
  firstPassPct: number;
  revisions: number; // most rounds per video, on average
  draftHours: number; // longest median time to a first draft
};

export const DEFAULT_TARGETS: Targets = { delivered: 20, onTimePct: 90, firstPassPct: 70, revisions: 1, draftHours: 48 };
export const KPI_TARGETS = "kpi.targets";

const HOUR = 3_600_000;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// "2026-09" moved by whole months
export function shiftMonth(ym: string, by: number): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
}

export const monthName = (ym: string, year = true) => `${MONTHS[Number(ym.slice(5, 7)) - 1]}${year ? ` ${ym.slice(0, 4)}` : ""}`;

// "30h", "3d"
export const hoursLabel = (h: number) => (h >= 72 ? `${Math.round(h / 24)}d` : `${Math.round(h)}h`);

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

type Move = KpiTask["moves"][number];
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
function sentBack(moves: Move[]) {
  const back = moves.filter((m) => m.to === "revision_requested");
  const internal = back.filter((m) => m.from === "sent_for_approval").length;
  return { internal, client: back.length - internal };
}

// picked up from the queue → first time it went for review. Null unless the
// history shows the edit starting (not a task that arrived mid-way).
export function draftHours(t: KpiTask): number | null {
  const start = t.moves.find((m) => m.from === "queued" && m.to === "editing");
  const sent = start && t.moves.find((m) => m.to === "sent_for_approval" && m.at >= start.at);
  return start && sent ? Math.round(((sent.at.getTime() - start.at.getTime()) / HOUR) * 10) / 10 : null;
}

const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : null);

// against its due date, the way History scores it (lib/history.ts)
const scored = (t: KpiTask) =>
  onTime({ ...t, id: "", kind: "client", personId: "", person: "", team: null, client: null, project: null, startedAt: null, completedAt: t.deliveredAt, revisions: 0 });

export function editorKpis(input: KpiTask[]) {
  const tasks = input.map((t) => ({ ...t, moves: settle(t.moves) }));
  const verdicts = tasks.map(scored);
  const rated = verdicts.filter((v): v is boolean => v !== null);
  const back = tasks.map((t) => sentBack(t.moves));
  const rounds = back.map((b) => b.internal + b.client);
  const byType = new Map<string, number>();
  for (const t of tasks) for (const tag of t.tags.length ? t.tags : ["Untagged"]) byType.set(tag, (byType.get(tag) ?? 0) + 1);
  const hours = median(tasks.map(draftHours).filter((h): h is number => h !== null));
  return {
    delivered: tasks.length,
    onTimePct: pct(rated.filter(Boolean).length, rated.length),
    firstPassPct: pct(rounds.filter((n) => n === 0).length, tasks.length),
    revisions: tasks.length ? Math.round((rounds.reduce((a, b) => a + b, 0) / tasks.length) * 10) / 10 : null,
    draftHours: hours === null ? null : Math.round(hours * 10) / 10,
    // sent back by our own review, and by the client
    internalRevisions: back.reduce((n, b) => n + b.internal, 0),
    clientRevisions: back.reduce((n, b) => n + b.client, 0),
    byType: [...byType.entries()].sort((a, b) => b[1] - a[1]),
    late: tasks.filter((_, i) => verdicts[i] === false).map((t) => t.title),
  };
}

export type Kpis = ReturnType<typeof editorKpis>;
export type KpiKey = keyof Targets;

// Whether a number meets its target; null when there's nothing to judge.
// Revisions and draft time are better lower, the rest higher.
export function meets(key: KpiKey, value: number | null, targets: Targets): boolean | null {
  if (value === null) return null;
  return key === "revisions" || key === "draftHours" ? value <= targets[key] : value >= targets[key];
}
