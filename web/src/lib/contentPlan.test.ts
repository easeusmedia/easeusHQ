import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PLAN, monthGrid, planFor, planTasks, weekLanes } from "./contentPlan.ts";

test("a week's project: the trailer in two days, the reels through the rest of the week", () => {
  const tasks = planTasks(DEFAULT_PLAN, ["Reel Trailer", "Reel"], "Podcast 30", "2026-09-22");
  const trailer = tasks.find((t) => t.type === "Reel Trailer")!;
  assert.deepEqual([trailer.start, trailer.due], ["2026-09-22", "2026-09-24"]);
  const reels = tasks.filter((t) => t.type === "Reel");
  assert.equal(reels.length, 6);
  assert.equal(reels[0].start, "2026-09-24"); // after the trailer
  assert.equal(reels.at(-1)!.due, "2026-09-29"); // the week's end
  // each one's work picks up where the one before was due
  for (let i = 1; i < reels.length; i++) assert.equal(reels[i].start, reels[i - 1].due);
  assert.equal(reels[0].title, "Reel 1 · Podcast 30");
});

test("a longer deadline stretches the same shape", () => {
  const tasks = planTasks(DEFAULT_PLAN, ["Reel Trailer", "Reel"], "X", "2026-09-22", "2026-10-06"); // two weeks
  assert.equal(tasks.find((t) => t.type === "Reel Trailer")!.due, "2026-09-26");
  assert.equal(tasks.filter((t) => t.type === "Reel").at(-1)!.due, "2026-10-06");
});

test("a type the project doesn't have, or the client doesn't get, plans nothing", () => {
  const plan = planFor([{ type: "Reel", count: 0 }]);
  assert.deepEqual(planTasks(plan, ["Reel"], "X", "2026-09-28"), []);
  assert.deepEqual(planTasks(plan, [], "X", "2026-09-28"), []);
});

test("a saved plan is cleaned up, and an older one read as ranges", () => {
  const plan = planFor([{ type: "Reel", count: 99, startDay: -4, endDay: -9 }, { type: "Nonsense", count: 3 }, null]);
  assert.equal(plan.length, 5);
  assert.deepEqual(plan.find((p) => p.type === "Reel"), { type: "Reel", count: 30, startDay: 0, endDay: 0 });
  assert.deepEqual(planFor(undefined), DEFAULT_PLAN);
  // "6 reels, first on day 5, then every 2 days" was days 5 to 15
  assert.deepEqual(planFor([{ type: "Reel", count: 6, startDay: 5, everyDays: 2 }]).find((p) => p.type === "Reel"), {
    type: "Reel",
    count: 6,
    startDay: 5,
    endDay: 15,
  });
});

test("a month is whole weeks, Monday first", () => {
  const sep = monthGrid(2026, 8); // September 2026 starts on a Tuesday
  assert.equal(sep[0][0], "2026-08-31");
  assert.equal(sep[0][1], "2026-09-01");
  assert.equal(sep.at(-1)!.at(-1), "2026-10-04");
  assert.ok(sep.every((w) => w.length === 7));
});

test("a week's bars: clipped to the week, stacked so none overlap", () => {
  const week = ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27"];
  const { placed, lanes } = weekLanes(week, [
    { id: "trailer", start: "2026-09-22", due: "2026-09-24" },
    { id: "reel1", start: "2026-09-24", due: "2026-09-25" },
    { id: "long", start: "2026-09-15", due: "2026-09-23" }, // began the week before
    { id: "next", start: "2026-09-26", due: "2026-10-02" }, // runs into next week
    { id: "gone", start: "2026-09-01", due: "2026-09-10" },
  ]);
  const at = (id: string) => placed.find((p) => p.item.id === id)!;
  assert.equal(placed.length, 4);
  assert.deepEqual([at("long").col, at("long").span, at("long").startsHere, at("long").endsHere], [0, 3, false, true]);
  assert.deepEqual([at("trailer").col, at("trailer").span], [1, 3]);
  assert.notEqual(at("trailer").lane, at("long").lane); // they share Tue and Wed
  assert.deepEqual([at("next").col, at("next").span, at("next").endsHere], [5, 2, false]);
  assert.ok(lanes >= 2);
});
