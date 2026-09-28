import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TARGETS, draftHours, editorKpis, focusStatus, letter, onTime, pastWeeks, settle, shiftMonth, withTargetDefaults, type KpiTask } from "./editorKpi.ts";

const at = (s: string) => new Date(`2026-09-${s}Z`);
const mv = (when: string, from: string, to: string) => ({ at: at(when), from, to });
const task = (over: Partial<KpiTask>): KpiTask => ({
  id: "t",
  title: "Video",
  client: null,
  createdAt: at("01T04:00:00"),
  deliveredAt: at("20T04:00:00"),
  dueDate: null,
  handedOffAt: null,
  tags: [],
  moves: [],
  ...over,
});
const T = DEFAULT_TARGETS;

test("a stage put straight back cancels out; one left in place stays", () => {
  const moves = [
    mv("12T23:14:02", "sent_for_client_approval", "revision_requested"),
    mv("12T23:14:06", "revision_requested", "sent_for_client_approval"),
    mv("13T10:00:00", "final_export_ready", "revision_requested"),
  ];
  assert.deepEqual(settle(moves).map((m) => m.to), ["revision_requested"]);
});

test("turnaround is the editor's own time: picked up → first draft", () => {
  const t = task({ moves: [mv("02T04:00:00", "queued", "editing"), mv("03T10:00:00", "editing", "sent_for_approval"), mv("05T04:00:00", "revision_requested", "sent_for_approval")] });
  assert.equal(draftHours(t), 30);
  // made straight into editing: it started when it was made
  assert.equal(draftHours(task({ createdAt: at("02T04:00:00"), moves: [mv("02T10:00:00", "editing", "sent_for_approval")] })), 6);
  // arrived mid-way from Notion: unknown
  assert.equal(draftHours(task({ moves: [mv("02T04:00:00", "sent_for_approval", "editing")] })), null);
});

test("on time means the first draft reached our review by the due date", () => {
  const due = at("05T00:00:00");
  assert.equal(onTime(task({ dueDate: due, moves: [mv("02T04:00:00", "queued", "editing"), mv("05T12:00:00", "editing", "sent_for_approval")] })), true);
  assert.equal(onTime(task({ dueDate: due, moves: [mv("02T04:00:00", "queued", "editing"), mv("06T12:00:00", "editing", "sent_for_approval")] })), false);
  assert.equal(onTime(task({ moves: [mv("02T04:00:00", "queued", "editing")] })), null);
});

test("each part scores 100 at target and falls in proportion; the score weighs them 40/25/20/15", () => {
  // 10 reels, 5 confirmed mistakes (0.5 a video, on target), no due dates, none sent back
  const tasks = Array.from({ length: 10 }, (_, i) => task({ id: `t${i}`, tags: ["Reel"] }));
  const k = editorKpis(tasks, [{ kind: "mistake", category: "Typos", count: 5, day: "2026-09-03" }], T);
  assert.equal(k.parts.quality.points, 100);
  assert.equal(k.parts.revisions.points, 100);
  assert.equal(k.parts.deadlines.points, null); // nothing to judge: left out
  assert.equal(k.parts.output.points, 50); // 10 of 20
  // (100·40 + 100·20 + 50·15) / 75
  assert.equal(k.score, 90);
  assert.equal(k.grade, "A");
});

test("mistakes are per video, so delivering more isn't punished", () => {
  const one = editorKpis([task({})], [{ kind: "mistake", category: "Typos", count: 2, day: "2026-09-03" }], T);
  const six = editorKpis(Array.from({ length: 6 }, () => task({})), [{ kind: "mistake", category: "Typos", count: 2, day: "2026-09-03" }], T);
  assert.equal(one.mistakesPerVideo, 2);
  assert.equal(one.parts.quality.points, 25);
  assert.equal(six.mistakesPerVideo, 0.3);
  assert.equal(six.parts.quality.points, 100);
});

test("output weighs the kind of work, and a month in progress is judged on its share", () => {
  const k = editorKpis([task({ tags: ["Trailer"] }), task({ tags: ["Podcast editing"] }), task({ tags: ["Reel"] }), task({})], [], T, 0.25);
  assert.equal(k.units, 6.5); // 3 + 1.5 + 1 + 1
  assert.equal(k.parts.output.target, 5);
  assert.equal(k.parts.output.points, 100);
});

test("nothing delivered and nothing found: no score", () => {
  const k = editorKpis([], [], T);
  assert.equal(k.score, null);
  assert.equal(k.grade, null);
});

test("letters: A+ from 95, A 85, B 75, C 65, D 50", () => {
  assert.deepEqual([100, 95, 94, 85, 75, 65, 50, 49].map(letter), ["A+", "A+", "A", "A", "B", "C", "D", "F"]);
});

test("the past four weeks run Monday to Sunday by date, newest first, this one to today", () => {
  const w = pastWeeks("2026-09-30");
  assert.deepEqual(w.map((x) => [x.from, x.to]), [
    ["2026-09-28", "2026-09-30"],
    ["2026-09-21", "2026-09-27"],
    ["2026-09-14", "2026-09-20"],
    ["2026-09-07", "2026-09-13"],
  ]);
  assert.equal(w[0].days, 3);
  assert.equal(w[1].label, "21–27 Sep");
  assert.equal(pastWeeks("2026-10-02")[0].label, "28 Sep – 2 Oct");
});

test("a focus area counts its kind of mistake since it was raised, and goes quiet after four weeks without one", () => {
  const m = (day: string, category = "Sound", count = 1) => ({ kind: "mistake", category, count, day });
  const area = { category: "Sound", opened: "2026-08-01" };
  assert.deepEqual(focusStatus(area, [m("2026-07-20"), m("2026-08-10", "Sound", 2), m("2026-09-20"), m("2026-09-21", "Typos")], "2026-09-30"), {
    cameUp: 3,
    lastSeen: "2026-09-20",
    quiet: false,
  });
  assert.equal(focusStatus(area, [m("2026-08-10")], "2026-09-30").quiet, true);
  // raised this week: too soon to call quiet
  assert.equal(focusStatus({ category: "Sound", opened: "2026-09-25" }, [], "2026-09-30").quiet, false);
  assert.deepEqual(focusStatus({ category: null, opened: "2026-08-01" }, [m("2026-09-01")], "2026-09-30"), { cameUp: 0, lastSeen: null, quiet: false });
});

test("saved targets keep the defaults for anything they don't set", () => {
  const t = withTargetDefaults({ output: 12, weights: { quality: 50 }, typeWeights: { Thumbnail: 0.5 } });
  assert.equal(t.output, 12);
  assert.deepEqual(t.weights, { quality: 50, deadlines: 25, revisions: 20, output: 15 });
  assert.equal(t.typeWeights.Trailer, 3);
  assert.equal(t.typeWeights.Thumbnail, 0.5);
});

test("months step across a year end", () => {
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
});
