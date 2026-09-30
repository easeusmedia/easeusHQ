// How an editor's work is scored: out of 10, and a grade (A+ to D).
// Decided with the admin (30 Sep 2026). Every number is adjustable on the
// Performance settings page; these are the starting ones.
//
// Each week is scored on its own, in three parts:
//   Quantity, 4 points: reels completed against 2 a working day (Monday to
//     Saturday), a trailer counting as 3 reels and a podcast episode as 2;
//     1.5 of the 4 are for speed, the share of videos moved from Editing to
//     Sent for approval within their type's standard (a reel 3.5 hours, a
//     podcast a day, a trailer a day and a half), clock time, Sundays
//     skipped. With no video timed, output carries all 4.
//   Quality, 4 points: each mistake takes its type's points off (0.5 for
//     most, Creative 0.05), a revision 0.5, a repeat (the same type again,
//     on another video, within 90 days) twice its points; averaged per
//     video, so delivering more is never punished.
//   Feedback, 2 points: starts at 1 each week; praise adds its points, a
//     concern takes its points off, a tip (for them to work on from now on)
//     does neither. Frame.io praise is worth 1.
// A creative change (for that video only: music, pacing, a different take)
// is neither a mistake nor feedback, and never counts. Frame.io comments
// with the creative words (bgm, broll, pacing…) are creative changes.
// A part with nothing to score (no video finished, say) is left out and
// the rest scaled to 10. A month, or any longer stretch, is the average of
// its weeks, part by part, added up.
//
// Pure (no database, no React) so all of it is testable on its own.

import { dueState, type DueState } from "./due.ts";

export type TypeRule = {
  // the standard: Editing to Sent for approval, in hours
  hours: number;
  // what one counts for in output, in reels
  units: number;
};

export const GRADES = ["A+", "A", "B", "C", "D"] as const;
export type Grade = (typeof GRADES)[number];
export const GRADE_LABEL: Record<Grade, string> = { "A+": "Outstanding", A: "Good", B: "Fair", C: "Needs work", D: "Poor" };

export type Scoring = {
  // 0 Sunday … 6 Saturday
  workDays: number[];
  reelsPerDay: number;
  types: Record<string, TypeRule>;
  // the 10 points, part by part
  quantityPoints: number;
  qualityPoints: number;
  feedbackPoints: number;
  // of Quantity's points, how many are for speed
  speedPoints: number;
  // Quality points a revision takes off, per video; mistakes take their
  // type's points (FeedbackCategory.weight)
  revisionPoints: number;
  // a repeated mistake takes this many times its points
  repeatMultiplier: number;
  // where Feedback starts each week, and what a Frame.io praise adds
  feedbackStart: number;
  praisePoints: number;
  // words that make a Frame.io comment a creative change, not a mistake
  // (comma-separated)
  creativeWords: string;
  // the lowest total for each grade; below C is D
  grades: Record<Exclude<Grade, "D">, number>;
};

export const DEFAULT_SCORING: Scoring = {
  workDays: [1, 2, 3, 4, 5, 6],
  reelsPerDay: 2,
  types: {
    Reel: { hours: 3.5, units: 1 },
    "Podcast editing": { hours: 24, units: 2 },
    Trailer: { hours: 36, units: 3 },
  },
  quantityPoints: 4,
  qualityPoints: 4,
  feedbackPoints: 2,
  speedPoints: 1.5,
  revisionPoints: 0.5,
  repeatMultiplier: 2,
  feedbackStart: 1,
  praisePoints: 1,
  creativeWords: "music, bgm, song, pace, pacing, vibe, style, feel, b-roll, broll, hook, intro, outro, colour grade, color grade, split screen, try, instead, prefer, suggest",
  grades: { "A+": 9, A: 8, B: 6.5, C: 5 },
};
export const SCORING_KEY = "performance.scoring";

// saved settings over the defaults, so a new setting always has a value
export function withScoringDefaults(saved: unknown): Scoring {
  const s = (saved && typeof saved === "object" ? saved : {}) as Partial<Scoring>;
  const num = <K extends keyof Scoring>(k: K) => (typeof s[k] === "number" ? (s[k] as number) : (DEFAULT_SCORING[k] as number));
  const g = (s.grades && typeof s.grades === "object" ? s.grades : {}) as Partial<Scoring["grades"]>;
  return {
    workDays: Array.isArray(s.workDays) && s.workDays.length ? s.workDays : DEFAULT_SCORING.workDays,
    reelsPerDay: num("reelsPerDay"),
    types: s.types && typeof s.types === "object" && Object.keys(s.types).length ? s.types : { ...DEFAULT_SCORING.types },
    quantityPoints: num("quantityPoints"),
    qualityPoints: num("qualityPoints"),
    feedbackPoints: num("feedbackPoints"),
    speedPoints: num("speedPoints"),
    revisionPoints: num("revisionPoints"),
    repeatMultiplier: num("repeatMultiplier"),
    feedbackStart: num("feedbackStart"),
    praisePoints: num("praisePoints"),
    creativeWords: typeof s.creativeWords === "string" ? s.creativeWords : DEFAULT_SCORING.creativeWords,
    grades: {
      "A+": typeof g["A+"] === "number" ? g["A+"] : DEFAULT_SCORING.grades["A+"],
      A: typeof g.A === "number" ? g.A : DEFAULT_SCORING.grades.A,
      B: typeof g.B === "number" ? g.B : DEFAULT_SCORING.grades.B,
      C: typeof g.C === "number" ? g.C : DEFAULT_SCORING.grades.C,
    },
  };
}

// a total out of 10, as a grade
export function gradeOf(total: number | null, s: Pick<Scoring, "grades">): Grade | null {
  if (total === null) return null;
  return (["A+", "A", "B", "C"] as const).find((g) => total >= s.grades[g]) ?? "D";
}

// what a feedback entry can be
export const ENTRY_KINDS = { mistake: "Mistake", creative: "Creative change", positive: "Praise", negative: "Concern", guidance: "Tip" } as const;

// ---------- days and hours (India, +5:30 all year) ----------

const HOUR = 3_600_000;
const DAY = 86_400_000;
const IST = 5.5 * HOUR;
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

export const dayOf = (d: Date) => new Date(d.getTime() + IST).toISOString().slice(0, 10);
export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
export const weekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();
// the moment a day starts in India
const midnight = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - IST);
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);

export const isWorkDay = (day: string, s: Pick<Scoring, "workDays">) => s.workDays.includes(weekday(day));

// Hours between two moments, skipping days that aren't working days
// (Sundays). Editors keep their own hours, so it's clock time.
export function workHours(from: Date, to: Date, s: Pick<Scoring, "workDays">): number {
  if (to <= from) return 0;
  let ms = 0;
  const last = dayOf(to);
  // ponytail: walks day by day; capped at a year, far past any real edit
  for (let day = dayOf(from), i = 0; day <= last && i < 366; day = addDays(day, 1), i++) {
    if (!isWorkDay(day, s)) continue;
    const start = Math.max(midnight(day).getTime(), from.getTime());
    const end = Math.min(midnight(addDays(day, 1)).getTime(), to.getTime());
    if (end > start) ms += end - start;
  }
  return round1(ms / HOUR);
}

// Working days in a stretch (both ends included): what the output target
// is measured against. Up to `now` only, today counting for the share of
// it gone, so a day or week under way is judged on the time it has had.
export function workingDaysIn(from: string, to: string, s: Pick<Scoring, "workDays">, now?: Date): number {
  const today = now ? dayOf(now) : null;
  let n = 0;
  for (let day = from, i = 0; day <= to && i < 400; day = addDays(day, 1), i++) {
    if (today && day > today) break;
    if (!isWorkDay(day, s)) continue;
    n += today && day === today ? Math.min(1, Math.max(0, (now!.getTime() - midnight(day).getTime()) / DAY)) : 1;
  }
  return round2(n);
}

// "3.5h", "1.5 days"
export const hoursLabel = (h: number) => (h >= 24 ? `${round1(h / 24)} day${h === 24 ? "" : "s"}` : `${round1(h)}h`);

// ---------- the kind of video ----------

// Older tasks have no type: guessed from the title, then taken as a reel.
const GUESSES: [RegExp, string][] = [
  [/trailer/i, "Trailer"],
  [/podcast|episode|\bep\.?\s*\d|long[- ]?form|full (video|episode)/i, "Podcast editing"],
  [/\breels?\b|\bshorts?\b/i, "Reel"],
];

export function workType(tags: string[], title: string, s: Pick<Scoring, "types">): { type: string; guessed: boolean } {
  const tagged = tags.find((x) => x in s.types) ?? tags[0];
  if (tagged) return { type: tagged, guessed: false };
  return { type: GUESSES.find(([re]) => re.test(title))?.[1] ?? "Reel", guessed: true };
}

// a kind of work with no rule of its own is taken as a reel
export const ruleFor = (type: string, s: Pick<Scoring, "types">): TypeRule => s.types[type] ?? s.types.Reel ?? { hours: 3.5, units: 1 };

// ---------- one video ----------

type Move = { at: Date; from: string; to: string };

export type KpiTask = {
  id: string;
  title: string;
  client: string | null;
  createdAt: Date;
  // when it reached the editor (made, or when it was scheduled to appear)
  assignedAt: Date;
  // first reached the client; null if it hasn't, or nobody saw it happen
  handedOffAt: Date | null;
  deliveredAt: Date | null;
  dueDate: Date | null;
  tags: string[];
  // stage changes, oldest first
  moves: Move[];
};

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

const REACHED = ["sent_for_client_approval", "final_export_ready", "delivered_and_uploaded"];

export type Video = ReturnType<typeof videoFacts>;

// Everything one video says about the editor: its type, when they started
// it (moved it to Editing) and first sent it on, how long that took against
// its type's standard, how often it came back, and when it first reached
// the client, which is when it's complete for them.
export function videoFacts(task: KpiTask, s: Scoring) {
  const moves = settle(task.moves);
  const { type, guessed } = workType(task.tags, task.title, s);
  const rule = ruleFor(type, s);
  const intoEditing = moves.find((m) => m.to === "editing");
  const start = intoEditing?.at ?? (moves[0]?.from === "editing" ? task.assignedAt : null);
  const moved = start && moves.find((m) => m.at >= start && (m.to === "sent_for_approval" || REACHED.includes(m.to)))?.at;
  const handed = start && task.handedOffAt && task.handedOffAt >= start ? task.handedOffAt : null;
  const sent = moved && handed ? (moved < handed ? moved : handed) : (moved ?? handed);
  const completedAt = task.handedOffAt ?? moves.find((m) => REACHED.includes(m.to))?.at ?? task.deliveredAt;
  // started only after it had already reached the client: that's rework, not the edit
  const editHours = start && sent && !(completedAt && start > completedAt) ? workHours(start, sent, s) : null;
  const back = sentBack(moves);
  return {
    id: task.id,
    title: task.title,
    client: task.client,
    type,
    guessed,
    units: rule.units,
    standardHours: rule.hours,
    assignedAt: task.assignedAt,
    startedAt: start,
    sentAt: sent,
    editHours,
    withinStandard: editHours === null ? null : editHours <= rule.hours,
    internalRevisions: back.internal,
    clientRevisions: back.client,
    completedAt,
    completedDay: completedAt ? dayOf(completedAt) : null,
    due: dueState(task.dueDate, task.handedOffAt) as DueState | null,
  };
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

// ---------- a period ----------

export type ScoreEntry = {
  kind: string;
  category: string | null;
  count: number;
  points: number | null;
  // a mistake: the Quality points its type takes off, and whether it
  // repeats one before
  weight: number;
  repeat: boolean;
};

export type PeriodInput = {
  // completed in the period, not left out
  videos: Video[];
  // logged in the period
  entries: ScoreEntry[];
  // working days they had, for the output target
  workDays: number;
};

const clamp = (n: number, max: number) => Math.min(max, Math.max(0, n));

export type Part = "quantity" | "quality" | "feedback";

// The parts that have a score, added up and scaled to 10: a part with
// nothing to score doesn't count for or against. Nothing at all, no total.
// what each part is out of
export const partMax = (s: Scoring): Record<Part, number> => ({ quantity: s.quantityPoints, quality: s.qualityPoints, feedback: s.feedbackPoints });

export function totalOf(parts: Record<Part, number | null>, s: Scoring): number | null {
  const max = partMax(s);
  // Feedback alone isn't a week's work
  if (parts.quantity === null && parts.quality === null) return null;
  const scored = (Object.keys(max) as Part[]).filter((p) => parts[p] !== null);
  const out = scored.reduce((n, p) => n + max[p], 0);
  return out ? round1((10 * scored.reduce((n, p) => n + parts[p]!, 0)) / out) : null;
}

// One editor's (or the team's) stretch, scored as one. Within a week that's
// the score; longer ones are the average of their weeks (averageWeeks).
export function scorePeriod(input: PeriodInput, s: Scoring) {
  const { videos, entries } = input;

  // Quantity: output and speed
  const units = round1(videos.reduce((n, v) => n + v.units, 0));
  const target = round1(input.workDays * s.reelsPerDay);
  const timed = videos.filter((v) => v.withinStandard !== null);
  const within = timed.filter((v) => v.withinStandard).length;
  const volume = target > 0 ? Math.min(1, units / target) : units > 0 ? 1 : null;
  const speed = timed.length ? within / timed.length : null;
  const quantity = volume === null ? null : round1(speed === null ? s.quantityPoints * volume : (s.quantityPoints - s.speedPoints) * volume + s.speedPoints * speed);

  // Quality
  const points = entries.filter((e) => e.kind === "mistake");
  const mistakes = points.reduce((n, e) => n + e.count, 0);
  const repeated = points.filter((e) => e.repeat).reduce((n, e) => n + e.count, 0);
  const revisions = videos.reduce((n, v) => n + v.internalRevisions + v.clientRevisions, 0);
  // the Quality points lost, in all
  const lost = points.reduce((n, e) => n + e.count * e.weight * (e.repeat ? s.repeatMultiplier : 1), 0) + revisions * s.revisionPoints;
  const quality = videos.length ? round1(clamp(s.qualityPoints - lost / videos.length, s.qualityPoints)) : null;

  // Feedback
  const positive = entries.filter((e) => e.kind === "positive");
  const negative = entries.filter((e) => e.kind === "negative");
  const net = positive.reduce((n, e) => n + (e.points ?? s.praisePoints), 0) - negative.reduce((n, e) => n + (e.points ?? 0), 0);
  const feedback = round1(clamp(s.feedbackStart + net, s.feedbackPoints));

  const total = totalOf({ quantity, quality, feedback }, s);

  const types = new Map<string, Video[]>();
  for (const v of videos) types.set(v.type, [...(types.get(v.type) ?? []), v]);
  const cats = new Map<string, { count: number; repeats: number }>();
  for (const e of points) {
    const c = cats.get(e.category ?? "Others") ?? { count: 0, repeats: 0 };
    c.count += e.count;
    if (e.repeat) c.repeats += e.count;
    cats.set(e.category ?? "Others", c);
  }

  return {
    total,
    grade: gradeOf(total, s),
    quantity,
    quality,
    feedback: total === null ? null : feedback,
    // how many weeks it's the average of; 1 for a week or a day
    weeks: 1,
    // behind Quantity
    completed: videos.length,
    units,
    target,
    timed: timed.length,
    within,
    editHours: timed.length ? round1([...timed.map((v) => v.editHours!)].sort((a, b) => a - b)[Math.floor(timed.length / 2)]) : null,
    byType: [...types.entries()]
      .map(([type, list]) => ({ type, count: list.length, within: list.filter((v) => v.withinStandard).length, timed: list.filter((v) => v.withinStandard !== null).length }))
      .sort((a, b) => b.count - a.count),
    // behind Quality
    feedbackPoints: points.length,
    mistakes,
    repeated,
    revisions,
    // Quality points lost a video, on average
    perVideo: videos.length ? round1(lost / videos.length) : null,
    byCategory: [...cats.entries()].map(([category, c]) => ({ category, ...c })).sort((a, b) => b.count - a.count),
    // behind Feedback
    positive: positive.length,
    negative: negative.length,
    net: round1(net),
  };
}

// The weeks (Monday to Sunday) a stretch covers, cut at its two ends.
export function weekChunks(from: string, to: string): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  for (let start = from, i = 0; start <= to && i < 160; i++) {
    const sunday = addDays(mondayOf(start), 6);
    out.push({ from: start, to: sunday < to ? sunday : to });
    start = addDays(sunday, 1);
  }
  return out;
}

const mean = (xs: (number | null)[]) => {
  const got = xs.filter((x): x is number => x !== null);
  return got.length ? round1(got.reduce((a, b) => a + b, 0) / got.length) : null;
};

// A stretch longer than a week: the counts from all of it (`whole`), and
// each metric the average of the weeks that scored it, added up again.
export function averageWeeks(whole: Kpis, weeks: Kpis[], s: Scoring): Kpis {
  const scored = weeks.filter((w) => w.total !== null);
  const parts = { quantity: mean(scored.map((w) => w.quantity)), quality: mean(scored.map((w) => w.quality)), feedback: mean(scored.map((w) => w.feedback)) };
  const total = totalOf(parts, s);
  return { ...whole, ...parts, total, grade: gradeOf(total, s), weeks: scored.length };
}

export type Kpis = ReturnType<typeof scorePeriod>;

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
