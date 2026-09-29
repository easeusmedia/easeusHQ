import { test } from "node:test";
import assert from "node:assert/strict";
import { daysIn, mondayOf, packLanes, spanOf, stretchOpen } from "./timeline.ts";

test("a task spans from its start (or making) to its due (or delivery) day, never backwards", () => {
  assert.deepEqual(spanOf({ start: "2026-09-28", created: "2026-09-20", due: "2026-10-02", delivery: null }), { start: "2026-09-28", end: "2026-10-02" });
  assert.deepEqual(spanOf({ start: null, created: "2026-09-20", due: null, delivery: "2026-09-25" }), { start: "2026-09-20", end: "2026-09-25" });
  assert.deepEqual(spanOf({ start: null, created: "2026-09-29", due: null, delivery: null }), { start: "2026-09-29", end: "2026-09-29" });
  assert.deepEqual(spanOf({ start: "2026-09-29", created: "2026-09-29", due: "2026-09-27", delivery: null }), { start: "2026-09-29", end: "2026-09-29" });
  assert.equal(daysIn({ start: "2026-09-28", end: "2026-10-02" }), 5);
});

test("weeks start on Monday", () => {
  assert.equal(mondayOf("2026-09-29"), "2026-09-28");
  assert.equal(mondayOf("2026-10-04"), "2026-09-28");
  assert.equal(mondayOf("2026-09-28"), "2026-09-28");
});

test("bars share a lane only when they don't overlap", () => {
  const a = { id: "a", start: "2026-09-28", end: "2026-09-30" };
  const b = { id: "b", start: "2026-09-29", end: "2026-10-01" };
  const c = { id: "c", start: "2026-10-01", end: "2026-10-02" };
  const d = { id: "d", start: "2026-09-30", end: "2026-09-30" };
  const lanes = packLanes([b, c, a, d]).map((l) => l.map((x) => x.id));
  assert.deepEqual(lanes, [["a", "c"], ["b"], ["d"]]);
});

test("open work runs on to today, and past its due day it's overdue", () => {
  const today = "2026-09-29";
  assert.deepEqual(stretchOpen({ start: "2026-09-20", end: "2026-09-20" }, null, today), { start: "2026-09-20", end: today, overdue: false });
  assert.deepEqual(stretchOpen({ start: "2026-09-20", end: "2026-09-25" }, "2026-09-25", today), { start: "2026-09-20", end: today, overdue: true });
  assert.deepEqual(stretchOpen({ start: "2026-09-28", end: "2026-10-03" }, "2026-10-03", today), { start: "2026-09-28", end: "2026-10-03", overdue: false });
});
