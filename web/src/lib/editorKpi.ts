// How an editor's work is measured, scored and graded, and how the mistakes
// they keep making become issues in their queue. Decided with the admin
// (29 Sep 2026):
//
// Every video, automatically:
//   its type (Reel, Trailer, Podcast editing…), from its tag, or guessed
//   from its title for older tasks that have none; when the editor picked
//   it up (moved it to Editing) and first sent it for review; how long that
//   took in working hours (Monday to Saturday, 10:00 to 19:00 in India,
//   leave excluded) against the standard for its type (a reel half a day,
//   a podcast episode one, a trailer one and a half); how many times it was
//   sent back; and when it first reached the client, which is when it's
//   complete for the editor.
//
// The score, out of 100, is five parts, each against a target:
//   quality    35%  confirmed mistakes a video; one the client caught counts
//                   double, since it got past our review
//   output     25%  videos completed, weighted by type (a reel is 1, a
//                   podcast episode 2, a trailer 3), against 2 a working day
//   speed      20%  videos edited within their type's standard
//   revisions  10%  times a video was sent back
//   issues     10%  recurring issues still open, and Frame.io comments left
//                   unticked after the video moved on
// A part scores 100 at its target or better and falls in proportion as it
// misses; one with nothing to judge is left out and the rest re-weighted.
// A period with fewer than two videos completed isn't graded: too little
// to judge fairly. A from 85, B from 70, C from 55, D below.
//
// Only real mistakes count against an editor. Creative direction ("try
// another song") is recorded and shown, never scored. A mistake Claude
// picked out of Frame.io counts once core has confirmed it.
//
// Issues: a kind of mistake that turns up on two different videos within
// 30 days opens an issue in the editor's queue on its own. It stays open
// until core resolves it, is suggested for resolving after three quiet
// weeks, and reopens by itself if that mistake comes back.
//
// Pure (no database, no React) so all of it is testable on its own.

import { dueState, type DueState } from "./due.ts";

export type Part = "quality" | "output" | "speed" | "revisions" | "issues";

export type Targets = {
  // reel-equivalents a working day
  dailyUnits: number;
  // the standard for each type of video, in working days
  typeDays: Record<string, number>;
  // 0 Sunday … 6 Saturday
  workDays: number[];
  // the working day, hours in India
  dayStart: number;
  dayEnd: number;
  mistakesPerVideo: number;
  revisions: number;
  onStandardPct: number;
  clientMistakeWeight: number;
  weights: Record<Part, number>;
  grades: { A: number; B: number; C: number };
};

export const DEFAULT_TARGETS: Targets = {
  dailyUnits: 2,
  typeDays: { Reel: 0.5, "Podcast editing": 1, Trailer: 1.5 },
  workDays: [1, 2, 3, 4, 5, 6],
  dayStart: 10,
  dayEnd: 19,
  mistakesPerVideo: 0.5,
  revisions: 1,
  onStandardPct: 85,
  clientMistakeWeight: 2,
  weights: { quality: 35, output: 25, speed: 20, revisions: 10, issues: 10 },
  grades: { A: 85, B: 70, C: 55 },
};
export const KPI_TARGETS = "kpi.targets";

// saved targets over the defaults, a level deep, so a new setting always
// has a value (and a setting from an older version is simply ignored)
export function withTargetDefaults(saved: unknown): Targets {
  const s = (saved && typeof saved === "object" ? saved : {}) as Partial<Targets>;
  const pick = <K extends keyof Targets>(k: K) => (k in s && s[k] !== undefined ? s[k]! : DEFAULT_TARGETS[k]);
  return {
    ...DEFAULT_TARGETS,
    dailyUnits: pick("dailyUnits"),
    typeDays: s.typeDays && typeof s.typeDays === "object" ? { ...s.typeDays } : { ...DEFAULT_TARGETS.typeDays },
    workDays: Array.isArray(s.workDays) ? s.workDays : DEFAULT_TARGETS.workDays,
    dayStart: pick("dayStart"),
    dayEnd: pick("dayEnd"),
    mistakesPerVideo: pick("mistakesPerVideo"),
    revisions: pick("revisions"),
    onStandardPct: pick("onStandardPct"),
    clientMistakeWeight: pick("clientMistakeWeight"),
    weights: { ...DEFAULT_TARGETS.weights, ...(s.weights ?? {}) },
    grades: { ...DEFAULT_TARGETS.grades, ...(s.grades ?? {}) },
  };
}

export const PART_LABEL: Record<Part, string> = { quality: "Quality", output: "Output", speed: "Speed", revisions: "Revisions", issues: "Issues" };
export const PART_ORDER: Part[] = ["quality", "output", "speed", "revisions", "issues"];

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

// ---------- days and hours (India, +5:30 all year) ----------

const HOUR = 3_600_000;
const DAY = 86_400_000;
const IST = 5.5 * HOUR;
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

export const dayOf = (d: Date) => new Date(d.getTime() + IST).toISOString().slice(0, 10);
export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const weekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();
// a moment: that day in India, at that hour
const moment = (day: string, hour: number) => new Date(Date.parse(`${day}T00:00:00Z`) - IST + hour * HOUR);
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);

export const isWorkDay = (day: string, t: Targets, leave: ReadonlySet<string>) => t.workDays.includes(weekday(day)) && !leave.has(day);

// Working hours between two moments: only the working day, only working
// days, leave excluded. A reel picked up at 6pm and sent at 11am the next
// day took two hours, not seventeen.
export function workingHours(from: Date, to: Date, t: Targets, leave: ReadonlySet<string> = new Set()): number {
  if (to <= from) return 0;
  let h = 0;
  const last = dayOf(to);
  // ponytail: walks day by day; capped at a year, far past any real edit
  for (let day = dayOf(from), i = 0; day <= last && i < 366; day = addDays(day, 1), i++) {
    if (!isWorkDay(day, t, leave)) continue;
    const s = Math.max(moment(day, t.dayStart).getTime(), from.getTime());
    const e = Math.min(moment(day, t.dayEnd).getTime(), to.getTime());
    if (e > s) h += (e - s) / HOUR;
  }
  return round1(h);
}

// Working days in a stretch (both ends included), leave excluded: what the
// output target is measured against. Up to `now` only, today counting for
// the share of its working hours gone, so a week under way is judged on
// the days it has had.
export function workingDaysIn(from: string, to: string, t: Targets, leave: ReadonlySet<string>, now?: Date): number {
  const today = now ? dayOf(now) : null;
  let n = 0;
  for (let day = from, i = 0; day <= to && i < 400; day = addDays(day, 1), i++) {
    if (today && day > today) break;
    if (!isWorkDay(day, t, leave)) continue;
    if (today && day === today) {
      const span = (t.dayEnd - t.dayStart) * HOUR;
      n += Math.min(1, Math.max(0, (now!.getTime() - moment(day, t.dayStart).getTime()) / span));
    } else n += 1;
  }
  return round2(n);
}

// "3h", "1.5d" (in working days)
export function hoursLabel(h: number, t: Targets = DEFAULT_TARGETS) {
  const perDay = t.dayEnd - t.dayStart;
  return h >= perDay ? `${round1(h / perDay)}d` : `${Math.round(h * 10) / 10}h`;
}

// ---------- the kind of video ----------

// Older tasks have no type: guessed from the title, then taken as a reel.
const GUESSES: [RegExp, string][] = [
  [/trailer/i, "Trailer"],
  [/podcast|episode|\bep\.?\s*\d|long[- ]?form|full (video|episode)/i, "Podcast editing"],
  [/\breels?\b|\bshorts?\b/i, "Reel"],
];

export function workType(tags: string[], title: string, t: Targets): { type: string; guessed: boolean } {
  const tagged = tags.find((x) => x in t.typeDays) ?? tags[0];
  if (tagged) return { type: tagged, guessed: false };
  return { type: GUESSES.find(([re]) => re.test(title))?.[1] ?? "Reel", guessed: true };
}

// a kind of work with no standard of its own is taken as a reel's
export const standardDays = (type: string, t: Targets) => t.typeDays[type] ?? 1 / t.dailyUnits;
export const unitsFor = (type: string, t: Targets) => round2(standardDays(type, t) * t.dailyUnits);

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

// When the edit began: picked up from the queue; for a task made straight
// into editing, when it reached them. Null when the history starts later.
function pickedUp(task: KpiTask, moves: Move[]): Date | null {
  const picked = moves.find((m) => m.from === "queued" && m.to === "editing");
  if (picked) return picked.at;
  return moves[0]?.from === "editing" ? task.assignedAt : null;
}

// the first time the editor sent it on: to our review, or straight on
function firstSent(moves: Move[], start: Date): Date | null {
  return moves.find((m) => m.at >= start && (m.to === "sent_for_approval" || REACHED.includes(m.to)))?.at ?? null;
}

export type Video = ReturnType<typeof videoFacts>;

// Everything one video says about the editor.
export function videoFacts(task: KpiTask, t: Targets, leave: ReadonlySet<string> = new Set()) {
  const moves = settle(task.moves);
  const { type, guessed } = workType(task.tags, task.title, t);
  const start = pickedUp(task, moves);
  // sent on for review, or handed to the client, whichever came first
  const handed = start && task.handedOffAt && task.handedOffAt >= start ? task.handedOffAt : null;
  const moved = start && firstSent(moves, start);
  const sent = moved && handed ? (moved < handed ? moved : handed) : (moved ?? handed);
  const standardHours = round1(standardDays(type, t) * (t.dayEnd - t.dayStart));
  const back = sentBack(moves);
  // complete for the editor the moment it first reached the client
  const completedAt = task.handedOffAt ?? moves.find((m) => REACHED.includes(m.to))?.at ?? task.deliveredAt;
  // a pickup after it had already reached the client is rework, not the edit
  const editHours = start && sent && !(completedAt && start > completedAt) ? workingHours(start, sent, t, leave) : null;
  return {
    id: task.id,
    title: task.title,
    client: task.client,
    type,
    guessed,
    units: unitsFor(type, t),
    assignedAt: task.assignedAt,
    pickedUpAt: start,
    sentAt: sent,
    editHours,
    standardHours,
    onStandard: editHours === null ? null : editHours <= standardHours,
    internalRevisions: back.internal,
    clientRevisions: back.client,
    completedAt,
    completedDay: completedAt ? dayOf(completedAt) : null,
    due: dueState(task.dueDate, task.handedOffAt) as DueState | null,
  };
}

// ---------- a period ----------

export type KpiEntry = {
  kind: string; // mistake | creative | praise | note
  category: string | null;
  count: number;
  day: string;
  taskId: string | null;
  fromClient: boolean;
  // for a mistake: confirmed, so it counts
  reviewed: boolean;
  source: string;
  resolved: boolean;
  // still unticked in Frame.io though the video has moved on since
  stale: boolean;
};

export type Grade = "A" | "B" | "C" | "D";
export function letter(score: number, t: Targets = DEFAULT_TARGETS): Grade {
  if (score >= t.grades.A) return "A";
  if (score >= t.grades.B) return "B";
  if (score >= t.grades.C) return "C";
  return "D";
}

export const MIN_TO_GRADE = 2;

const lowerIsBetter = (v: number, target: number) => (v <= target ? 100 : target <= 0 ? 0 : (100 * target) / v);
const higherIsBetter = (v: number, target: number) => (target <= 0 ? 100 : Math.min(100, (100 * v) / target));

export type PartScore = { value: number | null; target: number; points: number | null; weight: number };

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const tally = (pairs: [string, number][]) => {
  const map = new Map<string, number>();
  for (const [k, n] of pairs) map.set(k, (map.get(k) ?? 0) + n);
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
};

export type PeriodInput = {
  // completed in the period, not left out
  videos: Video[];
  // logged in the period
  entries: KpiEntry[];
  // given to them in the period
  assigned: number;
  // recurring issues open at the end of it
  openIssues: number;
  // working days they had, for the output target
  workDays: number;
};

// One editor's (or the team's) period, scored.
export function scorePeriod(input: PeriodInput, t: Targets) {
  const { videos, entries } = input;
  const completed = videos.length;
  const units = round1(videos.reduce((n, v) => n + v.units, 0));
  const confirmed = entries.filter((e) => e.kind === "mistake" && e.reviewed);
  const mistakeCount = confirmed.reduce((n, e) => n + e.count, 0);
  const weighted = confirmed.reduce((n, e) => n + e.count * (e.fromClient ? t.clientMistakeWeight : 1), 0);
  const rated = videos.filter((v) => v.onStandard !== null);
  const onStandardPct = rated.length ? Math.round((rated.filter((v) => v.onStandard).length / rated.length) * 100) : null;
  const rounds = videos.reduce((n, v) => n + v.internalRevisions + v.clientRevisions, 0);
  const feedback = entries.filter((e) => e.kind === "mistake" || e.kind === "creative");
  const unresolved = feedback.filter((e) => !e.resolved);
  const stale = unresolved.filter((e) => e.stale).length;

  const mistakesPerVideo = completed ? round2(weighted / completed) : weighted ? weighted : null;
  const revisions = completed ? round2(rounds / completed) : null;
  const outputTarget = round1(input.workDays * t.dailyUnits);
  const anything = completed > 0 || weighted > 0;
  const w = t.weights;
  const parts: Record<Part, PartScore> = {
    quality: { value: mistakesPerVideo, target: t.mistakesPerVideo, points: mistakesPerVideo === null ? null : lowerIsBetter(mistakesPerVideo, t.mistakesPerVideo), weight: w.quality },
    output: { value: units, target: outputTarget, points: outputTarget > 0 && anything ? higherIsBetter(units, outputTarget) : null, weight: w.output },
    // timed on at least two videos, or it isn't judged
    speed: { value: onStandardPct, target: t.onStandardPct, points: onStandardPct === null || rated.length < MIN_TO_GRADE ? null : higherIsBetter(onStandardPct, t.onStandardPct), weight: w.speed },
    revisions: { value: revisions, target: t.revisions, points: revisions === null ? null : lowerIsBetter(revisions, t.revisions), weight: w.revisions },
    // every open recurring issue costs 20, every comment ignored 5
    issues: { value: input.openIssues, target: 0, points: anything ? Math.max(0, 100 - 20 * input.openIssues - 5 * stale) : null, weight: w.issues },
  };
  const counted = Object.values(parts).filter((p) => p.points !== null && p.weight > 0);
  const weight = counted.reduce((n, p) => n + p.weight, 0);
  const enough = completed >= MIN_TO_GRADE;
  const score = enough && weight ? Math.round(counted.reduce((n, p) => n + p.points! * p.weight, 0) / weight) : null;
  for (const p of Object.values(parts)) if (p.points !== null) p.points = Math.round(p.points);

  const types = new Map<string, Video[]>();
  for (const v of videos) types.set(v.type, [...(types.get(v.type) ?? []), v]);

  return {
    score,
    grade: score === null ? null : letter(score, t),
    enough,
    parts,
    assigned: input.assigned,
    completed,
    units,
    outputTarget,
    mistakes: mistakeCount,
    mistakesPerVideo,
    clientMistakes: confirmed.filter((e) => e.fromClient).reduce((n, e) => n + e.count, 0),
    toConfirm: entries.filter((e) => e.kind === "mistake" && !e.reviewed).length,
    feedback: feedback.length,
    creative: entries.filter((e) => e.kind === "creative").length,
    praise: entries.filter((e) => e.kind === "praise").length,
    unresolved: unresolved.length,
    stale,
    revisions,
    internalRevisions: videos.reduce((n, v) => n + v.internalRevisions, 0),
    clientRevisions: videos.reduce((n, v) => n + v.clientRevisions, 0),
    firstPassPct: completed ? Math.round((videos.filter((v) => v.internalRevisions + v.clientRevisions === 0).length / completed) * 100) : null,
    onStandardPct,
    rated: rated.length,
    editHours: median(videos.map((v) => v.editHours).filter((h): h is number => h !== null)),
    openIssues: input.openIssues,
    byCategory: tally(confirmed.map((e) => [e.category ?? "Others", e.count])),
    byType: [...types.entries()]
      .map(([type, list]) => {
        const timed = list.filter((v) => v.editHours !== null);
        return {
          type,
          count: list.length,
          timed: timed.length,
          editHours: median(timed.map((v) => v.editHours!)),
          standardHours: list[0].standardHours,
          onStandardPct: timed.length ? Math.round((timed.filter((v) => v.onStandard).length / timed.length) * 100) : null,
        };
      })
      .sort((a, b) => b.count - a.count),
  };
}

export type Kpis = ReturnType<typeof scorePeriod>;

// ---------- issues ----------

export const RECUR_DAYS = 30;
export const QUIET_DAYS = 21;

export type Mark = { category: string; taskId: string | null; day: string; count: number };

// Confirmed mistakes over the 30 days to `today`, by kind, where a kind has
// turned up on two or more different videos (a mistake logged against no
// video in particular counts as one of its own).
export function recurring(marks: Mark[], today: string) {
  const since = addDays(today, -(RECUR_DAYS - 1));
  const by = new Map<string, Mark[]>();
  for (const m of marks) if (m.day >= since && m.day <= today) by.set(m.category, [...(by.get(m.category) ?? []), m]);
  const out = new Map<string, { videos: number; count: number; first: string; last: string }>();
  for (const [category, list] of by) {
    const videos = new Set(list.map((m, i) => m.taskId ?? `loose:${i}`)).size;
    if (videos < 2) continue;
    const days = list.map((m) => m.day).sort();
    out.set(category, { videos, count: list.reduce((n, m) => n + m.count, 0), first: days[0], last: days.at(-1)! });
  }
  return out;
}

export type IssueLike = { id: string; category: string | null; resolvedDay: string | null };

// What the queue needs, given what's been confirmed: issues to open (a
// kind of mistake now recurring that has none yet) and resolved ones to
// reopen (their kind of mistake has come back since).
// "Others" is a catch-all, not a pattern anyone can work on, so it never
// opens one by itself.
export function issuePlan(issues: IssueLike[], marks: Mark[], today: string) {
  const tracked = new Set(issues.map((i) => i.category).filter(Boolean));
  const open = [...recurring(marks, today).entries()]
    .filter(([category]) => !tracked.has(category) && category !== "Others")
    .map(([category, r]) => ({ category, first: r.first }));
  const reopen = issues.filter((i) => i.category && i.resolvedDay && marks.some((m) => m.category === i.category && m.day > i.resolvedDay!)).map((i) => i.id);
  return { open, reopen };
}

// Where an issue stands: how often its kind of mistake has come up since it
// was opened, on how many videos, the last time, and whether it's been
// quiet long enough to call it fixed (three weeks without one, and open at
// least that long).
export function issueStatus(issue: { category: string | null; openedDay: string; reopenedDay: string | null }, marks: Mark[], today: string) {
  const since = issue.openedDay;
  const mine = issue.category ? marks.filter((m) => m.category === issue.category && m.day >= since) : [];
  const lastSeen = mine.map((m) => m.day).sort().at(-1) ?? null;
  const quietFrom = addDays(today, -QUIET_DAYS);
  const watchedFrom = issue.reopenedDay ?? issue.openedDay;
  return {
    count: mine.reduce((n, m) => n + m.count, 0),
    videos: new Set(mine.map((m, i) => m.taskId ?? `loose:${i}`)).size,
    lastSeen,
    looksFixed: watchedFrom <= quietFrom && (!lastSeen || lastSeen <= quietFrom),
  };
}

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

export type PeriodKind = "week" | "month" | "range";
export type Period = {
  kind: PeriodKind;
  from: string;
  // the last day it covers so far: today, for one under way
  to: string;
  label: string;
  current: boolean;
  // the one before it, the same length, for the trend
  prev: { from: string; to: string };
};

const isDay = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

// The period a page is showing, from its query: a week (any day in it), a
// month, or a range of days. Never in the future; a range is at most a
// year, and an unreadable one falls back to the last 30 days.
export function periodFrom(q: { view?: string; week?: string; month?: string; from?: string; to?: string }, today: string): Period {
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

// The weeks (Monday to Sunday) or months leading up to and including the
// one holding `to`, oldest first, for the trend.
export function trendSpans(kind: PeriodKind, to: string, n: number): { from: string; to: string; label: string }[] {
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
