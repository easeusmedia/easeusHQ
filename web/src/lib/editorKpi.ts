// An editor's month, as the numbers ops runs the editing team on: how much
// shipped and how fast, whether it reached the client on time, how often it
// was sent back, and how many mistakes were found in it.
//
// The mistakes and the grade come from the Notion performance review this
// replaces: every mistake logged against an editor, by kind (typos,
// subtitles, sound…), graded on its scale — none is an A+, up to 2 an A, 4 a
// B, 6 a C, 8 a D, more an F.
//
// Pure (no database, no React) so the scoring is testable on its own; the
// Performance pages map tasks, their stage history and the feedback log
// onto KpiTask and KpiEntry.

import { onTime } from "./history.ts";
import { handoffUnknown } from "./due.ts";

export type KpiTask = {
  id: string;
  title: string;
  client: string | null;
  createdAt: Date;
  deliveredAt: Date;
  dueDate: Date | null;
  handedOffAt: Date | null;
  tags: string[];
  // stage changes, oldest first
  moves: { at: Date; from: string; to: string }[];
};

export type KpiEntry = {
  kind: string; // mistake | creative | praise | note
  category: string | null;
  count: number;
  day: string; // yyyy-mm-dd, in India
};

export type Targets = {
  delivered: number; // videos a month
  turnaroundHours: number; // at most, from assignment to reaching the client
  onTimePct: number;
  revisions: number; // per video, at most
  mistakes: number; // a month, at most
};

export const DEFAULT_TARGETS: Targets = { delivered: 20, turnaroundHours: 72, onTimePct: 90, revisions: 1, mistakes: 2 };
export const KPI_TARGETS = "kpi.targets";

// the Notion review's own kinds of mistake, and what Frame.io comments add
export const MISTAKE_CATEGORIES = [
  "Typos",
  "UK/US spelling",
  "Subtitles",
  "Sound",
  "Typography",
  "Animation",
  "Visual glitches",
  "Cuts and accuracy",
  "Following feedback",
  "Others",
];

export const ENTRY_KINDS = { mistake: "Mistake", creative: "Creative feedback", praise: "Praise", note: "Note" } as const;

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

// Days 1–7 are week 1, and so on: the Notion log's Week-1 to Week-5
export const weekOfMonth = (day: string) => Math.min(5, Math.floor((Number(day.slice(8, 10)) - 1) / 7) + 1);

export type Grade = "A+" | "A" | "B" | "C" | "D" | "F";
export function grade(mistakes: number): Grade {
  if (mistakes === 0) return "A+";
  if (mistakes <= 2) return "A";
  if (mistakes <= 4) return "B";
  if (mistakes <= 6) return "C";
  if (mistakes <= 8) return "D";
  return "F";
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

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
export function sentBack(moves: Move[]) {
  const back = moves.filter((m) => m.to === "revision_requested");
  const internal = back.filter((m) => m.from === "sent_for_approval").length;
  return { internal, client: back.length - internal };
}

// picked up from the queue → first time it went for review. Null unless the
// history shows the edit starting (not a task that arrived mid-way).
export function draftHours(t: KpiTask): number | null {
  const start = t.moves.find((m) => m.from === "queued" && m.to === "editing");
  const sent = start && t.moves.find((m) => m.to === "sent_for_approval" && m.at >= start.at);
  return start && sent ? round1((sent.at.getTime() - start.at.getTime()) / HOUR) : null;
}

// assigned → first reached the client (or delivered, if it never went for
// approval). Null for work that arrived from Notion already with the client:
// when it got there isn't known, and zero would flatter it.
export const turnaroundHours = (t: KpiTask): number | null =>
  handoffUnknown(t.createdAt, t.handedOffAt) ? null : round1(Math.max(0, (t.handedOffAt ?? t.deliveredAt).getTime() - t.createdAt.getTime()) / HOUR);

// against its due date, the way History scores it (lib/history.ts)
export const scoredOnTime = (t: KpiTask) =>
  onTime({
    ...t,
    kind: "client",
    personId: "",
    person: "",
    team: null,
    project: null,
    startedAt: null,
    completedAt: t.deliveredAt,
    revisions: 0,
  });

const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : null);
const tally = (pairs: [string, number][]) => {
  const map = new Map<string, number>();
  for (const [k, n] of pairs) map.set(k, (map.get(k) ?? 0) + n);
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
};

export function editorKpis(input: KpiTask[], entries: KpiEntry[] = []) {
  const tasks = input.map((t) => ({ ...t, moves: settle(t.moves) }));
  const verdicts = tasks.map(scoredOnTime);
  const rated = verdicts.filter((v): v is boolean => v !== null);
  const back = tasks.map((t) => sentBack(t.moves));
  const rounds = back.map((b) => b.internal + b.client);
  const mistakes = entries.filter((e) => e.kind === "mistake");
  const mistakeCount = mistakes.reduce((n, e) => n + e.count, 0);
  const turnaround = median(tasks.map(turnaroundHours).filter((h): h is number => h !== null));
  const draft = median(tasks.map(draftHours).filter((h): h is number => h !== null));
  return {
    delivered: tasks.length,
    turnaroundHours: turnaround === null ? null : round1(turnaround),
    draftHours: draft === null ? null : round1(draft),
    onTimePct: pct(rated.filter(Boolean).length, rated.length),
    firstPassPct: pct(rounds.filter((n) => n === 0).length, tasks.length),
    revisions: tasks.length ? round1(rounds.reduce((a, b) => a + b, 0) / tasks.length) : null,
    // sent back by our own review, and by the client
    internalRevisions: back.reduce((n, b) => n + b.internal, 0),
    clientRevisions: back.reduce((n, b) => n + b.client, 0),
    mistakes: mistakeCount,
    mistakesPerVideo: tasks.length ? round1(mistakeCount / tasks.length) : null,
    // nothing delivered and nothing found: there's nothing to grade
    grade: tasks.length || mistakeCount ? grade(mistakeCount) : null,
    byCategory: tally(mistakes.map((e) => [e.category ?? "Others", e.count])),
    // mistakes in each week of the month, Week 1 to Week 5
    weeks: [1, 2, 3, 4, 5].map((w) => mistakes.filter((e) => weekOfMonth(e.day) === w).reduce((n, e) => n + e.count, 0)),
    praise: entries.filter((e) => e.kind === "praise").length,
    byType: tally(tasks.flatMap((t) => (t.tags.length ? t.tags : ["Untagged"]).map((tag): [string, number] => [tag, 1]))),
    late: tasks.filter((_, i) => verdicts[i] === false).map((t) => t.title),
  };
}

export type Kpis = ReturnType<typeof editorKpis>;
export type KpiKey = keyof Targets;

const LOWER_IS_BETTER: KpiKey[] = ["turnaroundHours", "revisions", "mistakes"];

// Whether a number meets its target; null when there's nothing to judge.
export function meets(key: KpiKey, value: number | null, targets: Targets): boolean | null {
  if (value === null) return null;
  return LOWER_IS_BETTER.includes(key) ? value <= targets[key] : value >= targets[key];
}

// What's going well and where they could use support, in plain words, from
// this month against the last. The point isn't a ranking: it's what to talk
// about with them.
export function insights(now: Kpis, before: Kpis, targets: Targets): { good: string[]; watch: string[] } {
  const good: string[] = [];
  const watch: string[] = [];
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

  if (now.delivered && now.mistakes === 0) good.push("No mistakes found this month.");
  else if (before.mistakes > now.mistakes) good.push(`Fewer mistakes than last month: ${now.mistakes}, down from ${before.mistakes}.`);
  else if (now.mistakes > before.mistakes && now.mistakes > targets.mistakes)
    watch.push(`More mistakes than last month: ${now.mistakes}, up from ${before.mistakes}.`);

  // the same kind of mistake two months running is the thing to coach
  const lastMonth = new Map(before.byCategory);
  for (const [cat, n] of now.byCategory.filter(([c]) => c !== "Others").slice(0, 2)) {
    if (lastMonth.has(cat)) watch.push(`${cat} keeps coming up: ${n} this month after ${lastMonth.get(cat)} last month.`);
    else if (n >= 3) watch.push(`${cat} came up ${n} times this month.`);
  }

  if (now.onTimePct === 100 && now.delivered >= 2) good.push("Everything reached the client on time.");
  else if (now.late.length) watch.push(`${plural(now.late.length, "video")} reached the client late.`);

  if (now.delivered > before.delivered && before.delivered) good.push(`Delivered ${now.delivered} videos, up from ${before.delivered}.`);
  if (now.firstPassPct !== null && now.firstPassPct >= 70 && now.delivered >= 2) good.push(`${now.firstPassPct}% approved without being sent back.`);
  if (now.revisions !== null && before.revisions !== null && now.revisions > before.revisions && now.revisions > targets.revisions)
    watch.push(`Sent back more often: ${now.revisions} rounds per video, from ${before.revisions}.`);
  if (now.turnaroundHours !== null && before.turnaroundHours !== null) {
    if (now.turnaroundHours < before.turnaroundHours * 0.85) good.push(`Faster turnaround: ${hoursLabel(now.turnaroundHours)}, from ${hoursLabel(before.turnaroundHours)}.`);
    else if (now.turnaroundHours > before.turnaroundHours * 1.25 && now.turnaroundHours > targets.turnaroundHours)
      watch.push(`Slower turnaround: ${hoursLabel(now.turnaroundHours)}, from ${hoursLabel(before.turnaroundHours)}.`);
  }
  if (now.praise) good.push(`${plural(now.praise, "piece")} of praise logged.`);
  return { good: good.slice(0, 3), watch: watch.slice(0, 3) };
}
