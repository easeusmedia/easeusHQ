import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TARGETS,
  issuePlan,
  issueStatus,
  letter,
  periodFrom,
  recurring,
  scorePeriod,
  settle,
  trendSpans,
  videoFacts,
  withTargetDefaults,
  workingDaysIn,
  workingHours,
  workType,
  type KpiEntry,
  type KpiTask,
  type Mark,
} from "./editorKpi.ts";

const T = DEFAULT_TARGETS;
// a moment in India
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
const entry = (over: Partial<KpiEntry>): KpiEntry => ({
  kind: "mistake",
  category: "Typos",
  count: 1,
  day: "2026-09-28",
  taskId: null,
  fromClient: false,
  reviewed: true,
  source: "manual",
  resolved: true,
  stale: false,
  ...over,
});

test("working hours count only 10:00–19:00, Monday to Saturday, and skip leave", () => {
  // Saturday 6pm to Monday 11am: an hour on Saturday, an hour on Monday
  assert.equal(workingHours(ist("26T18:00:00"), ist("28T11:00:00"), T), 2);
  // before and after hours don't count
  assert.equal(workingHours(ist("28T08:00:00"), ist("28T21:00:00"), T), 9);
  assert.equal(workingHours(ist("26T18:00:00"), ist("28T11:00:00"), T, new Set(["2026-09-26"])), 1);
});

test("a week under way is judged on the working days it has had", () => {
  // Monday to Sunday, all done: six working days
  assert.equal(workingDaysIn("2026-09-21", "2026-09-27", T, new Set()), 6);
  // on leave Tuesday
  assert.equal(workingDaysIn("2026-09-21", "2026-09-27", T, new Set(["2026-09-22"])), 5);
  // Monday 14:30: half of today's working day
  assert.equal(workingDaysIn("2026-09-28", "2026-10-04", T, new Set(), ist("28T14:30:00")), 0.5);
});

test("the type comes from the tag, or is guessed from the title", () => {
  assert.deepEqual(workType(["Trailer"], "Anything", T), { type: "Trailer", guessed: false });
  assert.deepEqual(workType([], "Ep 12 trailer v2", T), { type: "Trailer", guessed: true });
  assert.deepEqual(workType([], "Military Leaders full episode", T), { type: "Podcast editing", guessed: true });
  assert.deepEqual(workType([], "Reel 3", T), { type: "Reel", guessed: true });
  assert.deepEqual(workType([], "Something else", T), { type: "Reel", guessed: true });
});

test("speed is the editor's own time, picked up to first sent, against the type's standard", () => {
  const reel = videoFacts(
    task({ tags: ["Reel"], moves: [mv("28T10:00:00", "queued", "editing"), mv("28T14:00:00", "editing", "sent_for_approval")] }),
    T
  );
  assert.equal(reel.editHours, 4);
  // handed to the client before it was ever sent for review: the clock stops there
  const handed = videoFacts(task({ tags: ["Reel"], handedOffAt: ist("28T12:00:00"), moves: [mv("28T10:00:00", "queued", "editing"), mv("29T12:00:00", "editing", "sent_for_approval")] }), T);
  assert.equal(handed.editHours, 2);
  assert.equal(reel.standardHours, 4.5);
  assert.equal(reel.onStandard, true);
  assert.equal(reel.units, 1);
  // a trailer: 1.5 working days, 13.5 hours
  const trailer = videoFacts(
    task({ tags: ["Trailer"], moves: [mv("28T10:00:00", "queued", "editing"), mv("29T16:00:00", "editing", "sent_for_approval")] }),
    T
  );
  assert.equal(trailer.editHours, 15);
  assert.equal(trailer.onStandard, false);
  assert.equal(trailer.units, 3);
  // sitting in the queue first doesn't count against them
  const queued = videoFacts(
    task({ assignedAt: ist("21T10:00:00"), tags: ["Reel"], moves: [mv("28T10:00:00", "queued", "editing"), mv("28T12:00:00", "editing", "sent_for_approval")] }),
    T
  );
  assert.equal(queued.editHours, 2);
});

test("complete for the editor when it first reaches the client; revisions split ours and the client's", () => {
  const v = videoFacts(
    task({
      handedOffAt: ist("29T12:00:00"),
      moves: [
        mv("28T10:00:00", "queued", "editing"),
        mv("28T12:00:00", "editing", "sent_for_approval"),
        mv("28T13:00:00", "sent_for_approval", "revision_requested"),
        mv("28T15:00:00", "revision_requested", "sent_for_approval"),
        mv("29T12:00:00", "sent_for_approval", "sent_for_client_approval"),
        mv("30T12:00:00", "sent_for_client_approval", "revision_requested"),
      ],
    }),
    T
  );
  assert.equal(v.completedDay, "2026-09-29");
  assert.equal(v.internalRevisions, 1);
  assert.equal(v.clientRevisions, 1);
});

test("a stage put straight back cancels out", () => {
  const moves = [mv("28T10:00:00", "editing", "revision_requested"), mv("28T10:01:00", "revision_requested", "editing")];
  assert.equal(settle(moves).length, 0);
});

const reel = (over: Partial<KpiTask> = {}) =>
  videoFacts(task({ tags: ["Reel"], moves: [mv("28T10:00:00", "queued", "editing"), mv("28T13:00:00", "editing", "sent_for_approval")], ...over }), T);

test("the score: five parts against their targets, and a grade", () => {
  // 12 reels in 6 working days: on target; nothing wrong
  const k = scorePeriod({ videos: Array.from({ length: 12 }, () => reel()), entries: [], assigned: 12, openIssues: 0, workDays: 6 }, T);
  assert.equal(k.parts.output.value, 12);
  assert.equal(k.parts.output.target, 12);
  assert.equal(k.score, 100);
  assert.equal(k.grade, "A");
  // half the output, and a mistake a video (twice the 0.5 allowed)
  const half = scorePeriod({ videos: Array.from({ length: 6 }, () => reel()), entries: Array.from({ length: 6 }, () => entry({})), assigned: 6, openIssues: 0, workDays: 6 }, T);
  assert.equal(half.parts.output.points, 50);
  assert.equal(half.parts.quality.points, 50);
  // 35×50 + 25×50 + 20×100 + 10×100 + 10×100, over 100
  assert.equal(half.score, 70);
  assert.equal(half.grade, "B");
});

test("only confirmed mistakes count, a client's catch counts double, creative direction never counts", () => {
  const videos = [reel(), reel()];
  const k = scorePeriod(
    {
      videos,
      entries: [entry({ fromClient: true }), entry({ reviewed: false }), entry({ kind: "creative", category: null })],
      assigned: 2,
      openIssues: 0,
      workDays: 1,
    },
    T
  );
  assert.equal(k.mistakes, 1);
  assert.equal(k.mistakesPerVideo, 1); // 2 weighted over 2 videos
  assert.equal(k.toConfirm, 1);
  assert.equal(k.creative, 1);
});

test("open issues and ignored comments cost points; fewer than two videos isn't graded", () => {
  const k = scorePeriod({ videos: [reel(), reel()], entries: [entry({ kind: "creative", resolved: false, stale: true })], assigned: 2, openIssues: 2, workDays: 1 }, T);
  assert.equal(k.parts.issues.points, 55);
  assert.equal(k.stale, 1);
  // speed isn't judged on a single timed video
  assert.equal(scorePeriod({ videos: [reel(), videoFacts(task({ title: "Reel 9" }), T)], entries: [], assigned: 2, openIssues: 0, workDays: 1 }, T).parts.speed.points, null);
  const light = scorePeriod({ videos: [reel()], entries: [], assigned: 1, openIssues: 0, workDays: 1 }, T);
  assert.equal(light.score, null);
  assert.equal(light.enough, false);
  assert.equal(light.parts.output.value, 1);
});

test("grades: A from 85, B 70, C 55, D below", () => {
  assert.deepEqual([90, 85, 84, 70, 69, 55, 54].map((s) => letter(s)), ["A", "A", "B", "B", "C", "C", "D"]);
});

const mark = (category: string, taskId: string | null, day: string): Mark => ({ category, taskId, day, count: 1 });

test("a kind of mistake on two different videos within 30 days is recurring", () => {
  const marks = [mark("UK/US spelling", "a", "2026-09-02"), mark("UK/US spelling", "a", "2026-09-10"), mark("Typos", "a", "2026-09-05"), mark("Typos", "b", "2026-09-20")];
  const r = recurring(marks, "2026-09-28");
  assert.equal(r.has("UK/US spelling"), false); // twice, but on one video
  assert.equal(r.get("Typos")?.videos, 2);
  // older than 30 days doesn't count
  assert.equal(recurring([mark("Sound", "a", "2026-08-01"), mark("Sound", "b", "2026-09-20")], "2026-09-28").size, 0);
});

test("the queue opens new recurring issues and reopens resolved ones that come back", () => {
  const marks = [mark("Typos", "a", "2026-09-05"), mark("Typos", "b", "2026-09-20"), mark("Sound", "c", "2026-09-25")];
  const plan = issuePlan(
    [
      { id: "i1", category: "Sound", resolvedDay: "2026-09-15" },
      { id: "i2", category: "Subtitles", resolvedDay: "2026-09-15" },
    ],
    marks,
    "2026-09-28"
  );
  assert.deepEqual(plan.open, [{ category: "Typos", first: "2026-09-05" }]);
  assert.deepEqual(plan.reopen, ["i1"]);
  // the catch-all never opens one by itself
  assert.deepEqual(issuePlan([], [mark("Others", "a", "2026-09-05"), mark("Others", "b", "2026-09-06")], "2026-09-28").open, []);
  // an issue already open isn't opened twice
  assert.deepEqual(issuePlan([{ id: "i3", category: "Typos", resolvedDay: null }], marks, "2026-09-28").open, []);
});

test("an issue looks fixed after three quiet weeks", () => {
  const marks = [mark("Typos", "a", "2026-09-01"), mark("Typos", "b", "2026-09-03")];
  const s = issueStatus({ category: "Typos", openedDay: "2026-09-01", reopenedDay: null }, marks, "2026-09-28");
  assert.equal(s.count, 2);
  assert.equal(s.videos, 2);
  assert.equal(s.lastSeen, "2026-09-03");
  assert.equal(s.looksFixed, true);
  assert.equal(issueStatus({ category: "Typos", openedDay: "2026-09-01", reopenedDay: null }, [...marks, mark("Typos", "c", "2026-09-20")], "2026-09-28").looksFixed, false);
});

test("periods: a week, a month and a range, never in the future, each with the one before", () => {
  const w = periodFrom({ view: "week", week: "2026-09-30" }, "2026-09-30");
  assert.deepEqual([w.from, w.to, w.current, w.prev.from, w.prev.to], ["2026-09-28", "2026-09-30", true, "2026-09-21", "2026-09-27"]);
  const m = periodFrom({ view: "month", month: "2026-08" }, "2026-09-30");
  assert.deepEqual([m.from, m.to, m.prev.from, m.prev.to], ["2026-08-01", "2026-08-31", "2026-07-01", "2026-07-31"]);
  const r = periodFrom({ view: "range", from: "2026-09-01", to: "2026-09-15" }, "2026-09-30");
  assert.deepEqual([r.from, r.to, r.prev.from, r.prev.to], ["2026-09-01", "2026-09-15", "2026-08-17", "2026-08-31"]);
  // a future month falls back to this one
  assert.equal(periodFrom({ view: "month", month: "2027-01" }, "2026-09-30").from, "2026-09-01");
});

test("the trend runs oldest first, ending with the period shown", () => {
  const weeks = trendSpans("week", "2026-09-30", 3);
  assert.deepEqual(weeks.map((w) => w.from), ["2026-09-14", "2026-09-21", "2026-09-28"]);
  assert.equal(weeks[2].to, "2026-09-30");
  assert.deepEqual(trendSpans("month", "2026-09-30", 2).map((m) => m.from), ["2026-08-01", "2026-09-01"]);
});

test("saved targets keep the defaults for anything they don't set", () => {
  const t = withTargetDefaults({ dailyUnits: 3, weights: { quality: 50 } });
  assert.equal(t.dailyUnits, 3);
  assert.equal(t.weights.quality, 50);
  assert.equal(t.weights.output, 25);
  assert.equal(t.typeDays.Trailer, 1.5);
});
