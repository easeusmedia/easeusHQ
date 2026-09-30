import { test } from "node:test";
import assert from "node:assert/strict";
import { chartSpans, periodFrom, repeats, settle, trendSpans, workType } from "./editorKpi.ts";

// a moment in India (28 Sep 2026 is a Monday)
const ist = (s: string) => new Date(`2026-09-${s}+05:30`);
const mv = (when: string, from: string, to: string) => ({ at: ist(when), from, to });
const TYPES = { types: { Reel: {}, "Podcast editing": {}, Trailer: {} } };

test("the type comes from the tag, or is guessed from the title", () => {
  assert.deepEqual(workType(["Trailer"], "Anything", TYPES), { type: "Trailer", guessed: false });
  assert.deepEqual(workType([], "CL - Pip Jamieson Trailer", TYPES), { type: "Trailer", guessed: true });
  assert.deepEqual(workType([], "Something", TYPES), { type: "Reel", guessed: true });
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

test("periods: a week, a month, a range, all time, each with the one before", () => {
  const w = periodFrom({ view: "week", week: "2026-09-30" }, "2026-09-30");
  assert.deepEqual([w.from, w.to, w.current, w.prev.from], ["2026-09-28", "2026-09-30", true, "2026-09-21"]);
  const m = periodFrom({ view: "month", month: "2026-08" }, "2026-09-30");
  assert.deepEqual([m.from, m.to], ["2026-08-01", "2026-08-31"]);
  const r = periodFrom({ view: "range", from: "2026-09-01", to: "2026-09-15" }, "2026-09-30");
  assert.deepEqual([r.prev.from, r.prev.to], ["2026-08-17", "2026-08-31"]);
  // never in the future; anything unreadable is this week
  assert.equal(periodFrom({ view: "week", week: "2026-12-01" }, "2026-09-30").from, "2026-09-28");
  const all = periodFrom({ view: "all" }, "2026-09-30", "2026-06-15");
  assert.deepEqual([all.kind, all.from, all.to], ["all", "2026-06-15", "2026-09-30"]);
});

test("charts: week by week, 12 weeks or the whole stretch", () => {
  assert.deepEqual(chartSpans({ from: "2026-09-28", to: "2026-09-30" }).map((s) => s.label).slice(-2), ["21 Sep", "28 Sep"]);
  assert.equal(chartSpans({ from: "2026-09-01", to: "2026-09-30" }).length, 12);
  assert.equal(chartSpans({ from: "2026-01-05", to: "2026-09-30" }).length, 39);
  assert.deepEqual(trendSpans("month", "2026-09-30", 2).map((s) => s.from), ["2026-08-01", "2026-09-01"]);
});
