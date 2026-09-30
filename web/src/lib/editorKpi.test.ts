import { test } from "node:test";
import assert from "node:assert/strict";
import {
  averageWeeks,
  DEFAULT_SCORING,
  gradeOf,
  periodFrom,
  repeats,
  scorePeriod,
  settle,
  trendSpans,
  videoFacts,
  weekChunks,
  withScoringDefaults,
  workHours,
  workingDaysIn,
  workType,
  type KpiTask,
  type ScoreEntry,
} from "./editorKpi.ts";

const S = DEFAULT_SCORING;
// a moment in India (26 Sep 2026 is a Saturday, 27 a Sunday, 28 a Monday)
const ist = (s: string) => new Date(`2026-09-${s}+05:30`);
const mv = (when: string, from: string, to: string) => ({ at: ist(when), from, to });
const task = (over: Partial<KpiTask>): KpiTask => ({
  id: "t",
  title: "Video",
  client: null,
  createdAt: ist("28T10:00:00"),
  assignedAt: ist("28T10:00:00"),
  handedOffAt: null,
  deliveredAt: null,
  dueDate: null,
  tags: [],
  moves: [],
  ...over,
});
const point = (over: Partial<ScoreEntry> = {}): ScoreEntry => ({ kind: "mistake", category: "Typos", count: 1, points: null, weight: 1, repeat: false, ...over });

test("hours are clock time, Sundays skipped", () => {
  assert.equal(workHours(ist("28T10:00:00"), ist("28T13:30:00"), S), 3.5);
  // Saturday 22:00 to Monday 02:00: two hours Saturday, two Monday; Sunday skipped
  assert.equal(workHours(ist("26T22:00:00"), ist("28T02:00:00"), S), 4);
});

test("the output target counts working days, today for the share gone", () => {
  assert.equal(workingDaysIn("2026-09-21", "2026-09-27", S), 6);
  assert.equal(workingDaysIn("2026-09-28", "2026-09-28", S, ist("28T12:00:00")), 0.5);
});

test("the type comes from the tag, or is guessed from the title", () => {
  assert.deepEqual(workType(["Trailer"], "Anything", S), { type: "Trailer", guessed: false });
  assert.deepEqual(workType([], "CL - Pip Jamieson Trailer", S), { type: "Trailer", guessed: true });
  assert.deepEqual(workType([], "Something", S), { type: "Reel", guessed: true });
});

test("speed: into Editing to Sent for approval, against the type's standard", () => {
  const reel = videoFacts(task({ tags: ["Reel"], moves: [mv("28T10:00:00", "queued", "editing"), mv("28T13:00:00", "editing", "sent_for_approval")] }), S);
  assert.equal(reel.editHours, 3);
  assert.equal(reel.withinStandard, true);
  assert.equal(reel.units, 1);
  const slow = videoFacts(task({ tags: ["Reel"], moves: [mv("28T10:00:00", "queued", "editing"), mv("28T14:30:00", "editing", "sent_for_approval")] }), S);
  assert.equal(slow.withinStandard, false);
  // a podcast has a day
  const pod = videoFacts(task({ tags: ["Podcast editing"], moves: [mv("28T10:00:00", "queued", "editing"), mv("29T09:00:00", "editing", "sent_for_approval")] }), S);
  assert.equal(pod.editHours, 23);
  assert.equal(pod.withinStandard, true);
  assert.equal(pod.units, 2);
  // started again only after it reached the client: rework, not timed
  const rework = videoFacts(task({ handedOffAt: ist("27T10:00:00"), moves: [mv("28T10:00:00", "revision_requested", "editing"), mv("28T11:00:00", "editing", "sent_for_approval")] }), S);
  assert.equal(rework.editHours, null);
});

test("a stage put straight back cancels out", () => {
  assert.equal(settle([mv("28T10:00:00", "editing", "revision_requested"), mv("28T10:01:00", "revision_requested", "editing")]).length, 0);
});

test("a repeat is the same category on a different video within 90 days", () => {
  const r = repeats([
    { id: "a", category: "Typos", taskId: "v1", at: ist("01T10:00:00") },
    { id: "b", category: "Typos", taskId: "v1", at: ist("01T11:00:00") }, // same video: not a repeat
    { id: "c", category: "Typos", taskId: "v2", at: ist("10T10:00:00") }, // next video: a repeat
    { id: "d", category: "Sound", taskId: "v2", at: ist("10T10:00:00") },
  ]);
  assert.deepEqual([...r], ["c"]);
});

const reel = (minutes = 180) =>
  videoFacts(task({ tags: ["Reel"], moves: [mv("28T10:00:00", "queued", "editing"), { at: new Date(ist("28T10:00:00").getTime() + minutes * 60_000), from: "editing", to: "sent_for_approval" }] }), S);

test("quantity: 2.5 for output against 2 reels a day, 1.5 for speed", () => {
  // 2 reels in a day, both inside 3.5 hours: 4
  assert.equal(scorePeriod({ videos: [reel(), reel()], entries: [], workDays: 1 }, S).quantity, 4);
  // 1 of 2, and it took too long: 2.5 × 0.5 + 1.5 × 0
  assert.equal(scorePeriod({ videos: [reel(300)], entries: [], workDays: 1 }, S).quantity, 1.3);
  // nothing timed: output carries all 4
  const untimed = videoFacts(task({ title: "Reel 9" }), S);
  assert.equal(scorePeriod({ videos: [untimed], entries: [], workDays: 1 }, S).quantity, 2);
});

test("quality: 4, less half a point for each mistake per video; repeats double, revisions count, types weigh", () => {
  const two = [reel(), reel()];
  assert.equal(scorePeriod({ videos: two, entries: [], workDays: 1 }, S).quality, 4);
  // 2 mistakes over 2 videos
  assert.equal(scorePeriod({ videos: two, entries: [point(), point()], workDays: 1 }, S).quality, 3.5);
  // one of them a repeat: 3 over 2
  const k = scorePeriod({ videos: two, entries: [point(), point({ repeat: true })], workDays: 1 }, S);
  assert.equal(k.quality, 3.3);
  assert.equal(k.repeated, 1);
  // ten creative notes at a tenth each: one mistake's worth
  assert.equal(scorePeriod({ videos: two, entries: [point({ category: "Creative", weight: 0.1, count: 10 })], workDays: 1 }, S).quality, 3.8);
  // feedback, praise and notes aren't mistakes
  assert.equal(scorePeriod({ videos: two, entries: [point({ kind: "guidance" }), point({ kind: "note" })], workDays: 1 }, S).quality, 4);
});

test("rating starts at 1: praise adds, a concern takes off; the total is out of 10", () => {
  const two = [reel(), reel()];
  const none = scorePeriod({ videos: two, entries: [], workDays: 1 }, S);
  assert.equal(none.rating, 1);
  assert.equal(none.total, 9);
  assert.equal(none.grade, "A+");
  // Frame.io praise is worth 1, core's is worth what they gave it
  const some = scorePeriod({ videos: two, entries: [point({ kind: "positive" }), point({ kind: "negative", points: 0.5 })], workDays: 1 }, S);
  assert.equal(some.rating, 1.5);
  assert.equal(some.total, 9.5);
  assert.equal(scorePeriod({ videos: two, entries: [point({ kind: "negative", points: 4 })], workDays: 1 }, S).rating, 0);
});

test("a part with nothing to score is left out and the rest scaled to 10", () => {
  // nothing finished in a working day: output 0, no quality; 0 + rating 1 of 6
  const idle = scorePeriod({ videos: [], entries: [], workDays: 1 }, S);
  assert.equal(idle.quality, null);
  assert.equal(idle.total, 1.7);
  // no working day and nothing done: nothing to score
  assert.equal(scorePeriod({ videos: [], entries: [], workDays: 0 }, S).total, null);
});

test("grades: A+ from 9, A from 8, B from 6.5, C from 5, D below", () => {
  assert.deepEqual([9, 8.9, 8, 6.5, 5, 4.9].map((t) => gradeOf(t, S)), ["A+", "A", "A", "B", "C", "D"]);
  assert.equal(gradeOf(null, S), null);
});

test("a month is the average of its weeks, metric by metric", () => {
  assert.deepEqual(weekChunks("2026-09-01", "2026-09-15"), [
    { from: "2026-09-01", to: "2026-09-06" },
    { from: "2026-09-07", to: "2026-09-13" },
    { from: "2026-09-14", to: "2026-09-15" },
  ]);
  const good = scorePeriod({ videos: [reel(), reel()], entries: [], workDays: 1 }, S); // 4 + 4 + 1
  const weak = scorePeriod({ videos: [reel(300)], entries: [point(), point()], workDays: 1 }, S); // 1.3 + 3 + 1
  const idle = scorePeriod({ videos: [], entries: [], workDays: 0 }, S); // nothing to score: left out
  const month = averageWeeks(good, [good, weak, idle], S);
  assert.equal(month.quantity, 2.7);
  assert.equal(month.quality, 3.5);
  assert.equal(month.rating, 1);
  assert.equal(month.total, 7.2);
  assert.equal(month.weeks, 2);
});

test("periods: a week, a month, a range, each with the one before", () => {
  const w = periodFrom({ view: "week", week: "2026-09-30" }, "2026-09-30");
  assert.deepEqual([w.from, w.to, w.current, w.prev.from], ["2026-09-28", "2026-09-30", true, "2026-09-21"]);
  const m = periodFrom({ view: "month", month: "2026-08" }, "2026-09-30");
  assert.deepEqual([m.from, m.to], ["2026-08-01", "2026-08-31"]);
  const r = periodFrom({ view: "range", from: "2026-09-01", to: "2026-09-15" }, "2026-09-30");
  assert.deepEqual([r.prev.from, r.prev.to], ["2026-08-17", "2026-08-31"]);
  // never in the future; anything unreadable is this week
  assert.equal(periodFrom({ view: "week", week: "2026-12-01" }, "2026-09-30").from, "2026-09-28");
  assert.equal(periodFrom({ view: "day" }, "2026-09-30").kind, "week");
});

test("history runs oldest first", () => {
  assert.deepEqual(trendSpans("month", "2026-09-30", 2).map((s) => s.from), ["2026-08-01", "2026-09-01"]);
  assert.deepEqual(trendSpans("week", "2026-09-30", 2).map((s) => s.from), ["2026-09-21", "2026-09-28"]);
});

test("saved scoring keeps the defaults for anything it doesn't set", () => {
  const s = withScoringDefaults({ reelsPerDay: 3, grades: { A: 7.5 } });
  assert.equal(s.reelsPerDay, 3);
  assert.equal(s.outputPoints, 2.5);
  assert.deepEqual(s.grades, { "A+": 9, A: 7.5, B: 6.5, C: 5 });
  assert.equal(s.types.Trailer.units, 3);
});
