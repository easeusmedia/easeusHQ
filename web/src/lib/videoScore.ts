// How a video is scored. The video is the unit: each one gets three scores
// out of 100 and an overall letter. Decided with Abhishek (30 Sep 2026);
// every number is adjustable on the Performance settings page.
//
// Quality: the grade the quality inspection gives it on first review,
//   starting at the top of its band (S 100, A+ 94, A 89, B 79, C 69, D 59,
//   so a clean A reads A, not A+), less the mistakes we found in it
//   (each its type's points, a repeat twice that, never more than 10 in
//   all, so the inspection always outweighs silly mistakes), plus 2 for
//   each praise and less 5 for each concern on it. Tips and creative
//   changes count for nothing. Ungraded, it has no Quality and no overall.
// Efficiency: 100, less 5 for every working day it reached Sent for
//   approval after its due day (a reel is due the day it's assigned, a
//   podcast a working day later, a trailer two; work assigned after 6 pm
//   counts from the next working day), 5 for each revision we asked for,
//   and 5 for every day a revision (ours or the client's) came back late.
// Client acceptance: 100, less 5 for each creative change and 10 for each
//   mistake from the client stage (the client's comments, or any left once
//   it had gone to the client). Not yet with the client: pending.
// Overall: Quality 50%, Efficiency 25%, Client acceptance 25%; a pending
//   part's share goes to the others.
// Letters: S from 95, A+ from 90, A from 80, B from 70, C from 60, D below.
//
// Pure (no database, no React) so all of it is testable on its own.

import { addDays, dayOf, isWorkDay, settle, workType } from "./editorKpi.ts";

export const LETTERS = ["S", "A+", "A", "B", "C", "D"] as const;
export type Letter = (typeof LETTERS)[number];
export const isLetter = (v: unknown): v is Letter => typeof v === "string" && (LETTERS as readonly string[]).includes(v);
export const LETTER_LABEL: Record<Letter, string> = { S: "Outstanding", "A+": "Excellent", A: "Good", B: "Fair", C: "Needs work", D: "Poor" };

// a video's three scores
export type Part = "quality" | "efficiency" | "client";
export const PART_LABEL: Record<Part, string> = { quality: "Quality", efficiency: "Efficiency", client: "Client acceptance" };

export type VideoScoring = {
  // the lowest score for each letter; below C is D
  bands: Record<Exclude<Letter, "D">, number>;
  // what each inspection grade starts Quality at
  base: Record<Letter, number>;
  weights: { quality: number; efficiency: number; client: number };
  // Quality: the most mistakes can take off, a repeat's multiple, praise and concern
  mistakeCap: number;
  repeatMultiplier: number;
  praisePoints: number;
  concernPoints: number;
  // Efficiency: working days (0 Sunday … 6 Saturday), the hour (IST) after
  // which work counts from the next day, and each type's extra days
  workDays: number[];
  cutoffHour: number;
  types: Record<string, { days: number }>;
  lateDay: number;
  revision: number;
  lateRevisionDay: number;
  // Client acceptance
  clientCreative: number;
  clientMistake: number;
  // words that make a Frame.io comment a creative change, not a mistake
  creativeWords: string;
};

export const DEFAULT_VIDEO_SCORING: VideoScoring = {
  bands: { S: 95, "A+": 90, A: 80, B: 70, C: 60 },
  base: { S: 100, "A+": 94, A: 89, B: 79, C: 69, D: 59 },
  weights: { quality: 50, efficiency: 25, client: 25 },
  mistakeCap: 10,
  repeatMultiplier: 2,
  praisePoints: 2,
  concernPoints: 5,
  workDays: [1, 2, 3, 4, 5, 6],
  cutoffHour: 18,
  types: { Reel: { days: 0 }, "Podcast editing": { days: 1 }, Trailer: { days: 2 } },
  lateDay: 5,
  revision: 5,
  lateRevisionDay: 5,
  clientCreative: 5,
  clientMistake: 10,
  creativeWords: "music, bgm, song, pace, pacing, vibe, style, feel, b-roll, broll, hook, intro, outro, colour grade, color grade, split screen, try, instead, prefer, suggest",
};
export const VIDEO_SCORING_KEY = "performance.videoScoring";

// saved settings over the defaults, so a new setting always has a value
export function withVideoScoringDefaults(saved: unknown): VideoScoring {
  const s = (saved && typeof saved === "object" ? saved : {}) as Partial<VideoScoring>;
  const d = DEFAULT_VIDEO_SCORING;
  const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
  const pick = <T extends Record<string, number>>(saved: unknown, fallback: T): T => {
    const o = (saved && typeof saved === "object" ? saved : {}) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(fallback).map(([k, v]) => [k, num(o[k], v)])) as T;
  };
  return {
    bands: pick(s.bands, d.bands),
    base: pick(s.base, d.base),
    weights: pick(s.weights, d.weights),
    mistakeCap: num(s.mistakeCap, d.mistakeCap),
    repeatMultiplier: num(s.repeatMultiplier, d.repeatMultiplier),
    praisePoints: num(s.praisePoints, d.praisePoints),
    concernPoints: num(s.concernPoints, d.concernPoints),
    workDays: Array.isArray(s.workDays) && s.workDays.length ? s.workDays : d.workDays,
    cutoffHour: num(s.cutoffHour, d.cutoffHour),
    types: s.types && typeof s.types === "object" && Object.keys(s.types).length ? s.types : { ...d.types },
    lateDay: num(s.lateDay, d.lateDay),
    revision: num(s.revision, d.revision),
    lateRevisionDay: num(s.lateRevisionDay, d.lateRevisionDay),
    clientCreative: num(s.clientCreative, d.clientCreative),
    clientMistake: num(s.clientMistake, d.clientMistake),
    creativeWords: typeof s.creativeWords === "string" ? s.creativeWords : d.creativeWords,
  };
}

// a score's letter
export function letterOf(score: number | null, s: Pick<VideoScoring, "bands">): Letter | null {
  if (score === null) return null;
  return (["S", "A+", "A", "B", "C"] as const).find((l) => score >= s.bands[l]) ?? "D";
}

// ---------- grading ----------

// moves out of Sent for approval that mean it's been reviewed
const GRADED_MOVES = ["revision_requested", "sent_for_client_approval", "final_export_ready", "delivered_and_uploaded"];

// Whether this move is a video's (or a design's) first review, which a
// Founder grades: the first time it's moved on from Sent for approval, if
// it has no grade yet.
export function needsGrade(task: { status: string; inspectionGrade?: string | null; assignedTo?: unknown; assignedToId?: string | null }, to: string, role: string): boolean {
  const assigned = task.assignedToId !== undefined ? !!task.assignedToId : !!task.assignedTo;
  return role === "admin" && assigned && task.status === "sent_for_approval" && !task.inspectionGrade && GRADED_MOVES.includes(to);
}

// ---------- days ----------

const IST = 5.5 * 3_600_000;
const HOUR = 3_600_000;
const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number) => Math.max(0, Math.min(100, round1(n)));

const nextWorkDay = (day: string, s: Pick<VideoScoring, "workDays">) => {
  let d = addDays(day, 1);
  for (let i = 0; i < 7 && !isWorkDay(d, s); i++) d = addDays(d, 1);
  return d;
};

// The working day something is due by: the day it starts (the next working
// day, when it starts after the cutoff or on a day off), then `extra`
// working days on.
export function dueDay(start: Date, extra: number, s: Pick<VideoScoring, "workDays" | "cutoffHour">): string {
  let day = dayOf(start);
  if (new Date(start.getTime() + IST).getUTCHours() >= s.cutoffHour || !isWorkDay(day, s)) day = nextWorkDay(day, s);
  for (let i = 0; i < extra; i++) day = nextWorkDay(day, s);
  return day;
}

// Working days after `due`, up to the day `done` happened: how late it was.
export function lateDays(due: string, done: Date, s: Pick<VideoScoring, "workDays">): number {
  const last = dayOf(done);
  let n = 0;
  for (let d = addDays(due, 1), i = 0; d <= last && i < 400; d = addDays(d, 1), i++) if (isWorkDay(d, s)) n++;
  return n;
}

// ---------- one video ----------

type Move = { at: Date; from: string; to: string };

// the stages that mean the editor has handed it over, and that it's gone to the client
const HANDED = ["sent_for_approval", "sent_for_client_approval", "final_export_ready", "delivered_and_uploaded"];
const WITH_CLIENT = ["sent_for_client_approval", "final_export_ready", "delivered_and_uploaded"];

export type VideoEntry = {
  kind: string;
  // from the client stage: the client's comment, or one left once it was with the client
  fromClient: boolean;
  count: number;
  // for praise or a concern added by hand, the points given
  points: number | null;
  // a mistake: its type's points, and whether it repeats one on another video
  weight: number;
  repeat: boolean;
};

export type VideoInput = {
  title: string;
  tags: string[];
  // when it was assigned to the editor
  assignedAt: Date;
  // stage changes, oldest first
  moves: Move[];
  grade: Letter | null;
  entries: VideoEntry[];
};

export type RevisionRound = { requestedAt: Date; byClient: boolean; due: string; backAt: Date | null; late: number; hours: number | null };

// Everything one video says about the editor, scored.
export function scoreVideo(v: VideoInput, s: VideoScoring) {
  const moves = settle(v.moves);
  const { type, guessed } = workType(v.tags, v.title, s);
  const extra = s.types[type]?.days ?? s.types.Reel?.days ?? 0;

  // Quality
  const mistakes = v.entries.filter((e) => e.kind === "mistake" && !e.fromClient);
  const lost = mistakes.reduce((n, e) => n + e.count * e.weight * (e.repeat ? s.repeatMultiplier : 1), 0);
  const praise = v.entries.filter((e) => e.kind === "positive");
  const concerns = v.entries.filter((e) => e.kind === "negative");
  const praised = praise.reduce((n, e) => n + (e.points ?? s.praisePoints), 0);
  const concerned = concerns.reduce((n, e) => n + (e.points ?? s.concernPoints), 0);
  const base = v.grade ? s.base[v.grade] : null;
  const taken = Math.min(lost, s.mistakeCap);
  const quality = base === null ? null : clamp(base - taken + praised - concerned);

  // Efficiency
  const sentAt = moves.find((m) => HANDED.includes(m.to))?.at ?? null;
  const due = dueDay(v.assignedAt, extra, s);
  const late = sentAt ? lateDays(due, sentAt, s) : 0;
  const rounds: RevisionRound[] = moves
    .filter((m) => m.to === "revision_requested" && (m.from === "sent_for_approval" || WITH_CLIENT.includes(m.from)))
    .map((m) => {
      const back = moves.find((b) => b.at > m.at && HANDED.includes(b.to))?.at ?? null;
      const started = moves.find((b) => b.at > m.at && b.to === "editing" && (!back || b.at <= back))?.at ?? m.at;
      const roundDue = dueDay(m.at, 0, s);
      return { requestedAt: m.at, byClient: m.from !== "sent_for_approval", due: roundDue, backAt: back, late: back ? lateDays(roundDue, back, s) : 0, hours: back ? round1((back.getTime() - started.getTime()) / HOUR) : null };
    });
  const ours = rounds.filter((r) => !r.byClient).length;
  const lateBack = rounds.reduce((n, r) => n + r.late, 0);
  const efficiency = sentAt ? clamp(100 - late * s.lateDay - ours * s.revision - lateBack * s.lateRevisionDay) : null;

  // Client acceptance
  const reached = moves.some((m) => WITH_CLIENT.includes(m.to));
  const count = (kind: string) => v.entries.filter((e) => e.kind === kind && e.fromClient).reduce((n, e) => n + e.count, 0);
  const clientCreative = count("creative");
  const clientMistakes = count("mistake");
  const client = reached ? clamp(100 - clientCreative * s.clientCreative - clientMistakes * s.clientMistake) : null;

  // Overall: only once graded; a pending part's share goes to the others
  const parts = [
    [quality, s.weights.quality],
    [efficiency, s.weights.efficiency],
    [client, s.weights.client],
  ] as const;
  const weight = parts.reduce((n, [v, w]) => (v === null ? n : n + w), 0);
  const overall = quality === null || !weight ? null : round1(parts.reduce((n, [v, w]) => (v === null ? n : n + v * w), 0) / weight);

  return {
    type,
    guessed,
    quality: { score: quality, grade: v.grade, base, lost: round1(lost), taken: round1(taken), mistakes: mistakes.reduce((n, e) => n + e.count, 0), repeats: mistakes.filter((e) => e.repeat).reduce((n, e) => n + e.count, 0), praise: praise.length, praised: round1(praised), concerns: concerns.length, concerned: round1(concerned) },
    efficiency: { score: efficiency, due, sentAt, late, rounds, ours, lateBack },
    client: { score: client, reached, creative: clientCreative, mistakes: clientMistakes },
    overall,
    letter: { quality: letterOf(quality, s), efficiency: letterOf(efficiency, s), client: letterOf(client, s), overall: letterOf(overall, s) },
  };
}

export type VideoScore = ReturnType<typeof scoreVideo>;

// The card's colour: gold for an S, green for an A+, by Quality
export function tierOf(quality: number | null, s: Pick<VideoScoring, "bands">): "S" | "A+" | null {
  const l = letterOf(quality, s);
  return l === "S" || l === "A+" ? l : null;
}

// ---------- many videos ----------

const mean = (xs: (number | null)[]) => {
  const got = xs.filter((x): x is number => x !== null);
  return got.length ? round1(got.reduce((a, b) => a + b, 0) / got.length) : null;
};

// An editor's (or the team's) videos over a stretch: the average of each
// score over the videos that have it, and how many made S and A+.
export function summarise(videos: VideoScore[], s: VideoScoring) {
  const overall = mean(videos.map((v) => v.overall));
  const quality = mean(videos.map((v) => v.quality.score));
  const efficiency = mean(videos.map((v) => v.efficiency.score));
  const client = mean(videos.map((v) => v.client.score));
  return {
    videos: videos.length,
    graded: videos.filter((v) => v.quality.grade).length,
    overall,
    quality,
    efficiency,
    client,
    letter: { overall: letterOf(overall, s), quality: letterOf(quality, s), efficiency: letterOf(efficiency, s), client: letterOf(client, s) },
    s: videos.filter((v) => v.letter.quality === "S").length,
    aPlus: videos.filter((v) => v.letter.quality === "A+").length,
  };
}

export type Summary = ReturnType<typeof summarise>;
