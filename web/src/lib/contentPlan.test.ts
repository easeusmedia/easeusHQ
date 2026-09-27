import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PLAN, planFor, planTasks } from "./contentPlan.ts";

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
