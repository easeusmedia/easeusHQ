import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PLAN, planDeliverables, planFor, planTasks } from "./contentPlan.ts";

test("delivered a week on: made on the 1st, the trailer the 7th, the long-form the 8th, the reels the 8th and 9th", () => {
  const tasks = planTasks(DEFAULT_PLAN, ["YouTube Long-Form", "Reel Trailer", "Reel"], "Podcast 30", "2026-10-01");
  assert.equal(tasks.find((t) => t.type === "Reel Trailer")!.due, "2026-10-07");
  assert.equal(tasks.find((t) => t.type === "YouTube Long-Form")!.due, "2026-10-08");
  const reels = tasks.filter((t) => t.type === "Reel");
  assert.equal(reels.length, 6);
  assert.deepEqual([...new Set(reels.map((r) => r.due))], ["2026-10-08", "2026-10-09"]);
  assert.equal(reels[0].title, "Reel 1 · Podcast 30");
});

test("a longer deadline stretches the same shape", () => {
  const tasks = planTasks(DEFAULT_PLAN, ["Reel Trailer", "Reel"], "X", "2026-10-01", "2026-10-15"); // two weeks
  assert.equal(tasks.find((t) => t.type === "Reel Trailer")!.due, "2026-10-13");
  assert.equal(tasks.filter((t) => t.type === "Reel").at(-1)!.due, "2026-10-17");
});

test("a project's deliverables are named after it, one each", () => {
  const d = planDeliverables(DEFAULT_PLAN, ["Reel Trailer", "Reel", "YouTube Long-Form"], "Pip Jamison", "2026-10-01");
  assert.deepEqual(
    d.map((x) => x.name),
    ["Pip Jamison Trailer", "Pip Jamison Long-form", "Pip Jamison Reel 1", "Pip Jamison Reel 2", "Pip Jamison Reel 3", "Pip Jamison Reel 4", "Pip Jamison Reel 5", "Pip Jamison Reel 6"]
  );
  assert.equal(d[0].due, "2026-10-07");
});

test("a type the project doesn't have, or the client doesn't get, plans nothing", () => {
  const plan = planFor([{ type: "Reel", count: 0 }]);
  assert.deepEqual(planTasks(plan, ["Reel"], "X", "2026-09-28"), []);
  assert.deepEqual(planTasks(plan, [], "X", "2026-09-28"), []);
});

test("a saved plan is cleaned up, and an older one read as ranges", () => {
  const plan = planFor([{ type: "Reel", count: 99, startDay: -4, endDay: -9 }, { type: "Nonsense", count: 3 }, null]);
  assert.equal(plan.length, 6);
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

test("every picked deliverable is a placeholder: the audio with the long-form, a bonus reel the blueprint has none of on its day", () => {
  const d = planDeliverables(DEFAULT_PLAN, ["YouTube Long-Form", "Audio", "Bonus Reel"], "Pip Jamison", "2026-10-01");
  assert.deepEqual(
    d.map((x) => [x.name, x.due]),
    [
      ["Pip Jamison Long-form", "2026-10-08"],
      ["Pip Jamison Audio", "2026-10-08"],
      ["Pip Jamison Bonus reel", "2026-10-09"],
    ]
  );
});
