// An editor's month as one score out of 100, and the four parts it's built
// from — decided with the admin (29 Sep 2026):
//
//   quality    40%  confirmed mistakes per video delivered
//   deadlines  25%  videos whose first draft reached our review by the due date
//   revisions  20%  times a video was sent back, per video
//   output     15%  videos delivered, weighted by kind (a trailer is 3, a
//                   podcast episode 1.5, a reel 1), against a monthly target
//
// Each part scores 100 at or better than its target and falls in proportion
// as it misses (half the target's output is 50; twice the mistakes allowed
// is 50). A part with nothing to judge is left out and the rest re-weighted.
// The letter follows the score: A+ from 95, A 85, B 75, C 65, D 50, else F.
//
// Mistakes come from the Notion log, from ops, and from Frame.io comments
// Claude sorts as mistakes, the last only once ops has confirmed them.
//
// Pure (no database, no React) so the scoring is testable on its own.

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

export type Part = "quality" | "deadlines" | "revisions" | "output";

export type Targets = {
  output: number; // weighted videos a month
  mistakesPerVideo: number;
  revisions: number; // per video
  onTimePct: number;
  draftHours: number; // shown, not scored
  weights: Record<Part, number>;
  typeWeights: Record<string, number>;
};

export const DEFAULT_TARGETS: Targets = {
  output: 20,
  mistakesPerVideo: 0.5,
  revisions: 1,
  onTimePct: 90,
  draftHours: 48,
  weights: { quality: 40, deadlines: 25, revisions: 20, output: 15 },
  typeWeights: { Trailer: 3, "Podcast editing": 1.5, Reel: 1 },
};
export const KPI_TARGETS = "kpi.targets";

// saved targets over the defaults, a level deep, so a new setting always
// has a value
export function withTargetDefaults(saved: unknown): Targets {
  const s = (saved && typeof saved === "object" ? saved : {}) as Partial<Targets>;
  return {
    ...DEFAULT_TARGETS,
    ...s,
    weights: { ...DEFAULT_TARGETS.weights, ...(s.weights ?? {}) },
    typeWeights: { ...DEFAULT_TARGETS.typeWeights, ...(s.typeWeights ?? {}) },
  };
}

export const PART_LABEL: Record<Part, string> = { quality: "Quality", deadlines: "Deadlines", revisions: "Revisions", output: "Output" };

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
export const daysInMonth = (ym: string) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();

// "30h", "3d"
export const hoursLabel = (h: number) => (h >= 72 ? `${Math.round(h / 24)}d` : `${Math.round(h)}h`);

// Days 1–7 are week 1, and so on: the Notion log's Week-1 to Week-5
export const weekOfMonth = (day: string) => Math.min(5, Math.floor((Number(day.slice(8, 10)) - 1) / 7) + 1);
// the last day of week w in a month
export const weekEnd = (ym: string, w: number) => Math.min(daysInMonth(ym), w * 7 + (w === 5 ? 3 : 0));

export type Grade = "A+" | "A" | "B" | "C" | "D" | "F";
export function letter(score: number): Grade {
  if (score >= 95) return "A+";
  if (score >= 85) return "A";
  if (score >= 75) return "B";
  if (score >= 65) return "C";
  if (score >= 50) return "D";
  return "F";
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const indiaDay = (d: Date) => new Date(d.getTime() + 5.5 * HOUR).toISOString().slice(0, 10);

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

// When the edit began: picked up from the queue, or, for a task that was
// made straight into editing, when it was made. Null when the history
// starts somewhere later (it arrived from Notion part-way through).
function editStart(t: KpiTask): Date | null {
  const picked = t.moves.find((m) => m.from === "queued" && m.to === "editing");
  if (picked) return picked.at;
  return t.moves[0]?.from === "editing" ? t.createdAt : null;
}

// the first time the editor sent it to our review
export function firstDraftAt(t: KpiTask): Date | null {
  const start = editStart(t);
  const sent = t.moves.find((m) => m.to === "sent_for_approval" && (!start || m.at >= start));
  if (sent) return sent.at;
  // no record of the draft: when it reached the client is the nearest we know
  return t.handedOffAt && !handoffUnknown(t.createdAt, t.handedOffAt) ? t.handedOffAt : null;
}

// start of editing → first draft: the editor's own time, not the queue's
export function draftHours(t: KpiTask): number | null {
  const start = editStart(t);
  const sent = start && t.moves.find((m) => m.to === "sent_for_approval" && m.at >= start);
  return start && sent ? round1((sent.at.getTime() - start.getTime()) / HOUR) : null;
}

// first draft by the due day (both in India); null when there's no due date
// or no way of knowing when the draft went in
export function onTime(t: KpiTask): boolean | null {
  const draft = firstDraftAt(t);
  if (!t.dueDate || !draft) return null;
  return indiaDay(draft) <= indiaDay(t.dueDate);
}

// a video's weight in output: its kind's weight, 1 for anything unlisted
export const unitsOf = (t: KpiTask, typeWeights: Record<string, number>) =>
  t.tags.length ? Math.max(...t.tags.map((tag) => typeWeights[tag] ?? 1)) : 1;

const lowerIsBetter = (v: number, target: number) => (v <= target ? 100 : target <= 0 ? 0 : (100 * target) / v);
const higherIsBetter = (v: number, target: number) => (target <= 0 ? 100 : Math.min(100, (100 * v) / target));

export type PartScore = { value: number | null; target: number; points: number | null; weight: number };

const tally = (pairs: [string, number][]) => {
  const map = new Map<string, number>();
  for (const [k, n] of pairs) map.set(k, (map.get(k) ?? 0) + n);
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
};

// One editor's (or the team's) month. `share` is how much of the month the
// numbers cover, so output is judged against the same share of its target:
// a month still running isn't marked down for the days it hasn't had yet.
export function editorKpis(input: KpiTask[], entries: KpiEntry[], targets: Targets, share = 1) {
  const tasks = input.map((t) => ({ ...t, moves: settle(t.moves) }));
  const verdicts = tasks.map(onTime);
  const rated = verdicts.filter((v): v is boolean => v !== null);
  const back = tasks.map((t) => sentBack(t.moves));
  const rounds = back.reduce((n, b) => n + b.internal + b.client, 0);
  const mistakes = entries.filter((e) => e.kind === "mistake");
  const mistakeCount = mistakes.reduce((n, e) => n + e.count, 0);
  const delivered = tasks.length;
  const units = round1(tasks.reduce((n, t) => n + unitsOf(t, targets.typeWeights), 0));
  const onTimePct = rated.length ? Math.round((rated.filter(Boolean).length / rated.length) * 100) : null;
  const mistakesPerVideo = delivered ? round1(mistakeCount / delivered) : mistakeCount ? mistakeCount : null;
  const revisions = delivered ? round1(rounds / delivered) : null;
  const draft = median(tasks.map(draftHours).filter((h): h is number => h !== null));

  const w = targets.weights;
  const outputTarget = round1(targets.output * share);
  const parts: Record<Part, PartScore> = {
    quality: { value: mistakesPerVideo, target: targets.mistakesPerVideo, points: mistakesPerVideo === null ? null : lowerIsBetter(mistakesPerVideo, targets.mistakesPerVideo), weight: w.quality },
    deadlines: { value: onTimePct, target: targets.onTimePct, points: onTimePct === null ? null : higherIsBetter(onTimePct, targets.onTimePct), weight: w.deadlines },
    revisions: { value: revisions, target: targets.revisions, points: revisions === null ? null : lowerIsBetter(revisions, targets.revisions), weight: w.revisions },
    output: { value: units, target: outputTarget, points: delivered || mistakeCount ? higherIsBetter(units, outputTarget) : null, weight: w.output },
  };
  const counted = Object.values(parts).filter((p) => p.points !== null && p.weight > 0);
  const weight = counted.reduce((n, p) => n + p.weight, 0);
  const score = weight ? Math.round(counted.reduce((n, p) => n + p.points! * p.weight, 0) / weight) : null;
  for (const p of Object.values(parts)) if (p.points !== null) p.points = Math.round(p.points);

  return {
    score,
    grade: score === null ? null : letter(score),
    parts,
    delivered,
    units,
    mistakes: mistakeCount,
    mistakesPerVideo,
    revisions,
    internalRevisions: back.reduce((n, b) => n + b.internal, 0),
    clientRevisions: back.reduce((n, b) => n + b.client, 0),
    onTimePct,
    rated: rated.length,
    draftHours: draft === null ? null : round1(draft),
    firstPassPct: delivered ? Math.round((back.filter((b) => b.internal + b.client === 0).length / delivered) * 100) : null,
    byCategory: tally(mistakes.map((e) => [e.category ?? "Others", e.count])),
    byType: tally(tasks.map((t) => [t.tags[0] ?? "Untagged", 1])),
    praise: entries.filter((e) => e.kind === "praise").length,
    late: tasks.filter((_, i) => verdicts[i] === false).map((t) => t.title),
  };
}

export type Kpis = ReturnType<typeof editorKpis>;

const fmt = (p: Part, v: number) => (p === "deadlines" ? `${v}%` : p === "output" ? `${v}` : `${v}`);
const UNIT: Record<Part, string> = { quality: "mistakes per video", deadlines: "on time", revisions: "rounds per video", output: "weighted videos" };

// What's going well and where they could use support, in plain words: the
// parts that hold the score up or pull it down, a kind of mistake that keeps
// coming back, and how the score moved. The point isn't a ranking: it's
// what to talk about with them.
export function insights(now: Kpis, before: Kpis): { good: string[]; watch: string[] } {
  const good: string[] = [];
  const watch: string[] = [];
  const parts = (Object.entries(now.parts) as [Part, PartScore][]).filter(([, p]) => p.points !== null && p.value !== null);

  // the weakest parts first, by how much they cost the score
  for (const [key, p] of [...parts].sort((a, b) => (a[1].points! - 100) * a[1].weight - (b[1].points! - 100) * b[1].weight)) {
    if (p.points! < 70) watch.push(`${PART_LABEL[key]}: ${fmt(key, p.value!)} ${UNIT[key]}, against a target of ${fmt(key, p.target)}.`);
  }
  const lastMonth = new Map(before.byCategory);
  for (const [cat, n] of now.byCategory.filter(([c]) => c !== "Others").slice(0, 2)) {
    if (lastMonth.has(cat)) watch.push(`${cat} keeps coming up: ${n} this month after ${lastMonth.get(cat)} last month.`);
  }

  if (now.delivered && now.mistakes === 0) good.push(`No mistakes across ${now.delivered} video${now.delivered === 1 ? "" : "s"}.`);
  if (now.onTimePct === 100 && now.rated >= 2) good.push("Every first draft was on time.");
  if (now.delivered >= 2 && now.revisions === 0) good.push("Nothing was sent back.");
  if (now.score !== null && before.score !== null) {
    if (now.score >= before.score + 5) good.push(`Score up from ${before.score} to ${now.score}.`);
    else if (now.score <= before.score - 5) watch.push(`Score down from ${before.score} to ${now.score}.`);
  }
  if (now.praise) good.push(`${now.praise} piece${now.praise === 1 ? "" : "s"} of praise logged.`);
  return { good: good.slice(0, 3), watch: watch.slice(0, 3) };
}
