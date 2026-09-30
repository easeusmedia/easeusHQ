// How an editor's work is scored: Quantity, Quality and Feedback, five
// points each. Decided with the admin (30 Sep 2026):
//
// Quantity (how much, and how fast): 3 points for output, reels completed
//   against 2 a working day (Monday to Saturday, leave excluded), a trailer
//   counting as 3 reels and a podcast episode as 2; 2 points for speed, the
//   share of videos moved from Editing to Sent for approval within their
//   type's standard (a reel 3.5 hours, a podcast a day, a trailer a day and
//   a half), timed as it happens, Sundays and leave skipped. Hours are
//   flexible, so it's clock time. With no video timed, output carries all 5.
//
// Quality (how clean the work is): starts at 5 and loses a point for every
//   mistake per video, on average. Each feedback point from Frame.io counts
//   by its category's weight (a creative note half a mistake, say); a
//   revision counts as one; a mistake repeated (the same kind again, on
//   another video, within 90 days) counts double. Per video, so delivering
//   more is never punished.
//
// Feedback (core's own word on the editor): starts at 2.5; praise adds,
//   negative feedback takes away, each by the points given, between 0 and
//   5. Only scored in a period with some; otherwise the score is out of 10.
//
// Every number here is adjustable on the Performance page (Scoring).
// Pure (no database, no React) so all of it is testable on its own.

import { dueState, type DueState } from "./due.ts";

export type TypeRule = {
  // the standard: Editing to Sent for approval, in hours
  hours: number;
  // what one counts for in output, in reels
  units: number;
};

export type Scoring = {
  // 0 Sunday … 6 Saturday
  workDays: number[];
  reelsPerDay: number;
  types: Record<string, TypeRule>;
  // of Quantity's 5 points, how many are output; the rest are speed
  volumePoints: number;
  // Quality points lost for each mistake per video
  mistakePoints: number;
  // a revision counts as this many mistakes
  revisionWeight: number;
  // a repeated mistake counts as this many
  repeatWeight: number;
  // where the Feedback score starts
  feedbackStart: number;
  // what praise and negative feedback are worth unless given another amount
  praisePoints: number;
  concernPoints: number;
};

export const DEFAULT_SCORING: Scoring = {
  workDays: [1, 2, 3, 4, 5, 6],
  reelsPerDay: 2,
  types: {
    Reel: { hours: 3.5, units: 1 },
    "Podcast editing": { hours: 24, units: 2 },
    Trailer: { hours: 36, units: 3 },
  },
  volumePoints: 3,
  mistakePoints: 1,
  revisionWeight: 1,
  repeatWeight: 2,
  feedbackStart: 2.5,
  praisePoints: 1,
  concernPoints: 1,
};
export const SCORING_KEY = "performance.scoring";

// saved settings over the defaults, so a new setting always has a value
export function withScoringDefaults(saved: unknown): Scoring {
  const s = (saved && typeof saved === "object" ? saved : {}) as Partial<Scoring>;
  const num = <K extends keyof Scoring>(k: K) => (typeof s[k] === "number" ? (s[k] as number) : (DEFAULT_SCORING[k] as number));
  return {
    workDays: Array.isArray(s.workDays) && s.workDays.length ? s.workDays : DEFAULT_SCORING.workDays,
    reelsPerDay: num("reelsPerDay"),
    types: s.types && typeof s.types === "object" && Object.keys(s.types).length ? s.types : { ...DEFAULT_SCORING.types },
    volumePoints: num("volumePoints"),
    mistakePoints: num("mistakePoints"),
    revisionWeight: num("revisionWeight"),
    repeatWeight: num("repeatWeight"),
    feedbackStart: num("feedbackStart"),
    praisePoints: num("praisePoints"),
    concernPoints: num("concernPoints"),
  };
}

// what Frame.io comments can be besides a feedback point, and core's own
export const ENTRY_KINDS = { mistake: "Feedback point", praise: "Praise (Frame.io)", note: "Not feedback", positive: "Praise", negative: "Negative feedback" } as const;

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

export const isWorkDay = (day: string, s: Pick<Scoring, "workDays">, leave: ReadonlySet<string>) => s.workDays.includes(weekday(day)) && !leave.has(day);

// Hours between two moments, skipping days that aren't working days
// (Sundays) and leave. Editors keep their own hours, so it's clock time.
export function workHours(from: Date, to: Date, s: Pick<Scoring, "workDays">, leave: ReadonlySet<string> = new Set()): number {
  if (to <= from) return 0;
  let ms = 0;
  const last = dayOf(to);
  // ponytail: walks day by day; capped at a year, far past any real edit
  for (let day = dayOf(from), i = 0; day <= last && i < 366; day = addDays(day, 1), i++) {
    if (!isWorkDay(day, s, leave)) continue;
    const start = Math.max(midnight(day).getTime(), from.getTime());
    const end = Math.min(midnight(addDays(day, 1)).getTime(), to.getTime());
    if (end > start) ms += end - start;
  }
  return round1(ms / HOUR);
}

// Working days in a stretch (both ends included), leave excluded: what the
// output target is measured against. Up to `now` only, today counting for
// the share of it gone, so a day or week under way is judged on the time
// it has had.
export function workingDaysIn(from: string, to: string, s: Pick<Scoring, "workDays">, leave: ReadonlySet<string>, now?: Date): number {
  const today = now ? dayOf(now) : null;
  let n = 0;
  for (let day = from, i = 0; day <= to && i < 400; day = addDays(day, 1), i++) {
    if (today && day > today) break;
    if (!isWorkDay(day, s, leave)) continue;
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
export function videoFacts(task: KpiTask, s: Scoring, leave: ReadonlySet<string> = new Set()) {
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
  const editHours = start && sent && !(completedAt && start > completedAt) ? workHours(start, sent, s, leave) : null;
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

// Which feedback points repeat an earlier one: the same category, on a
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
  // a feedback point: its category's weight, and whether it repeats one before
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

const clamp5 = (n: number) => Math.min(5, Math.max(0, n));

// One editor's (or the team's) period, scored.
export function scorePeriod(input: PeriodInput, s: Scoring) {
  const { videos, entries } = input;

  // Quantity
  const units = round1(videos.reduce((n, v) => n + v.units, 0));
  const target = round1(input.workDays * s.reelsPerDay);
  const timed = videos.filter((v) => v.withinStandard !== null);
  const within = timed.filter((v) => v.withinStandard).length;
  const volume = target > 0 ? Math.min(1, units / target) : units > 0 ? 1 : null;
  const speed = timed.length ? within / timed.length : null;
  const quantity = volume === null ? null : round1(speed === null ? 5 * volume : s.volumePoints * volume + (5 - s.volumePoints) * speed);

  // Quality
  const points = entries.filter((e) => e.kind === "mistake");
  const mistakes = points.reduce((n, e) => n + e.count, 0);
  const repeated = points.filter((e) => e.repeat).reduce((n, e) => n + e.count, 0);
  const revisions = videos.reduce((n, v) => n + v.internalRevisions + v.clientRevisions, 0);
  const weighted = points.reduce((n, e) => n + e.count * e.weight * (e.repeat ? s.repeatWeight : 1), 0) + revisions * s.revisionWeight;
  const quality = videos.length ? round1(clamp5(5 - (s.mistakePoints * weighted) / videos.length)) : null;

  // Feedback
  const positive = entries.filter((e) => e.kind === "positive");
  const negative = entries.filter((e) => e.kind === "negative");
  const net = positive.reduce((n, e) => n + (e.points ?? s.praisePoints), 0) - negative.reduce((n, e) => n + (e.points ?? s.concernPoints), 0);
  const feedback = positive.length + negative.length ? round1(clamp5(s.feedbackStart + net)) : null;

  const parts = [quantity, quality, feedback].filter((p): p is number => p !== null);
  const total = parts.length ? round1(parts.reduce((a, b) => a + b, 0)) : null;
  const max = parts.length * 5;

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
    max,
    // the total as a share, to compare periods scored out of 10 and 15
    pct: total === null ? null : Math.round((100 * total) / max),
    quantity,
    quality,
    feedback,
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
    perVideo: videos.length ? round1(weighted / videos.length) : null,
    byCategory: [...cats.entries()].map(([category, c]) => ({ category, ...c })).sort((a, b) => b.count - a.count),
    // behind Feedback
    positive: positive.length,
    negative: negative.length,
    net: round1(net),
  };
}

export type Kpis = ReturnType<typeof scorePeriod>;

// ---------- periods ----------

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// "2026-09" moved by whole months
export function shiftMonth(ym: string, by: number): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
}
export const monthName = (ym: string, year = true) => `${MONTHS[Number(ym.slice(5, 7)) - 1]}${year ? ` ${ym.slice(0, 4)}` : ""}`;
export const daysInMonth = (ym: string) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();
export const shortDay = (day: string) => `${Number(day.slice(8, 10))} ${SHORT[Number(day.slice(5, 7)) - 1]}`;
export const dayName = (day: string) => `${WEEKDAYS[weekday(day)]} ${shortDay(day)}`;
export const mondayOf = (day: string) => addDays(day, -((weekday(day) + 6) % 7));

// "22–28 Sep", "29 Sep – 5 Oct"
export function spanLabel(from: string, to: string) {
  if (from === to) return shortDay(from);
  return from.slice(0, 7) === to.slice(0, 7) ? `${Number(from.slice(8))}–${shortDay(to)}` : `${shortDay(from)} – ${shortDay(to)}`;
}

// the working day before (or after) this one
export function stepWorkDay(day: string, by: 1 | -1, workDays: number[]) {
  let d = addDays(day, by);
  for (let i = 0; i < 7 && !workDays.includes(weekday(d)); i++) d = addDays(d, by);
  return d;
}

export type PeriodKind = "day" | "week" | "month" | "range";
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

// The period a page is showing, from its query: a day, a week (any day in
// it), a month, or a range of days. Never in the future; a range is at most
// a year, and an unreadable one falls back to the last 30 days.
export function periodFrom(q: { view?: string; day?: string; week?: string; month?: string; from?: string; to?: string }, today: string, workDays: number[] = DEFAULT_SCORING.workDays): Period {
  if (q.view === "day") {
    const day = isDay(q.day) && q.day <= today ? q.day : today;
    const before = stepWorkDay(day, -1, workDays);
    return { kind: "day", from: day, to: day, label: dayName(day), current: day === today, prev: { from: before, to: before } };
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

// The days (working ones), weeks or months leading up to and including the
// one holding `to`, oldest first, for the history.
export function trendSpans(kind: PeriodKind, to: string, n: number, workDays: number[] = DEFAULT_SCORING.workDays): { from: string; to: string; label: string }[] {
  if (kind === "day") {
    const days = [workDays.includes(weekday(to)) ? to : stepWorkDay(to, -1, workDays)];
    while (days.length < n) days.unshift(stepWorkDay(days[0], -1, workDays));
    return days.map((d) => ({ from: d, to: d, label: dayName(d) }));
  }
  if (kind === "month") {
    const ym = to.slice(0, 7);
    return Array.from({ length: n }, (_, i) => {
      const m = shiftMonth(ym, i - (n - 1));
      const end = `${m}-${String(daysInMonth(m)).padStart(2, "0")}`;
      return { from: `${m}-01`, to: end < to ? end : to, label: monthName(m, false).slice(0, 3) };
    });
  }
  const monday = mondayOf(to);
  return Array.from({ length: n }, (_, i) => {
    const from = addDays(monday, -7 * (n - 1 - i));
    const sunday = addDays(from, 6);
    return { from, to: sunday < to ? sunday : to, label: spanLabel(from, sunday) };
  });
}
