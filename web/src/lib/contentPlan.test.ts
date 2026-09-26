import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PLAN, monthGrid, planFor, planTasks } from "./contentPlan.ts";

test("a project's tasks come out dated by the plan, soonest first", () => {
  const tasks = planTasks(DEFAULT_PLAN, ["YouTube Long-Form", "Thumbnails", "Reel"], "Podcast 30", "2026-09-28");
  assert.equal(tasks.length, 8);
  assert.deepEqual(tasks.slice(0, 3).map((t) => [t.title, t.due]), [
    ["YouTube Long-Form · Podcast 30", "2026-10-01"],
    ["Thumbnail · Podcast 30", "2026-10-01"],
    ["Reel 1 · Podcast 30", "2026-10-03"],
  ]);
  // six reels, every other day, across the month end
  assert.deepEqual(tasks.filter((t) => t.type === "Reel").map((t) => t.due), [
    "2026-10-03", "2026-10-05", "2026-10-07", "2026-10-09", "2026-10-11", "2026-10-13",
  ]);
});

test("a type the project doesn't have, or the client doesn't get, plans nothing", () => {
  const plan = planFor([{ type: "Reel", count: 0 }]);
  assert.deepEqual(planTasks(plan, ["Reel"], "X", "2026-09-28"), []);
  assert.deepEqual(planTasks(plan, [], "X", "2026-09-28"), []);
});

test("a saved plan is cleaned up: every type present, numbers kept in range", () => {
  const plan = planFor([{ type: "Reel", count: 99, startDay: -4, everyDays: 0 }, { type: "Nonsense", count: 3 }, null]);
  assert.equal(plan.length, 5);
  assert.deepEqual(plan.find((p) => p.type === "Reel"), { type: "Reel", count: 30, startDay: 0, everyDays: 1 });
  assert.deepEqual(planFor(undefined), DEFAULT_PLAN);
});

test("a month is whole weeks, Monday first", () => {
  const sep = monthGrid(2026, 8); // September 2026 starts on a Tuesday
  assert.equal(sep[0][0], "2026-08-31");
  assert.equal(sep[0][1], "2026-09-01");
  assert.equal(sep.at(-1)!.at(-1), "2026-10-04");
  assert.ok(sep.every((w) => w.length === 7));
});
