import { test } from "node:test";
import assert from "node:assert/strict";
import { activeHours, filterHistory, median, onTime, summarize, totals, turnaroundHours, type HistoryItem } from "./history.ts";

const h = (n: number) => new Date(Date.UTC(2026, 8, 1, 0, 0) + n * 3_600_000);
const item = (over: Partial<HistoryItem> = {}): HistoryItem => ({
  id: "1",
  kind: "client",
  title: "Elle Sera - Trailer",
  personId: "u1",
  person: "Narendra Mehta",
  team: "Operations",
  client: "Elle Sera",
  project: "Short-form",
  tags: ["Reel"],
  createdAt: h(0),
  startedAt: h(2),
  completedAt: h(10),
  dueDate: null,
  handedOffAt: null,
  revisions: 0,
  ...over,
});

test("how long a task took, waiting included and excluded", () => {
  assert.equal(turnaroundHours(item()), 10);
  assert.equal(activeHours(item()), 8);
  assert.equal(activeHours(item({ startedAt: null })), null); // unknown, not zero
  assert.equal(turnaroundHours(item({ completedAt: h(-5) })), 0); // never negative
});

test("on time is judged by the day in India, and skipped without a due date", () => {
  assert.equal(onTime(item({ dueDate: null })), null);
  assert.equal(onTime(item({ completedAt: h(10), dueDate: h(24) })), true);
  assert.equal(onTime(item({ completedAt: h(48), dueDate: h(10) })), false);
  // 20:00 UTC on the 1st is 01:30 on the 2nd in India — the due day there
  assert.equal(onTime(item({ completedAt: h(20), dueDate: h(30) })), true);
});

test("filters narrow by date, person, kind, tag and free text", () => {
  const items = [
    item({ id: "a", completedAt: h(10) }),
    item({ id: "b", personId: "u2", person: "Sparsh", completedAt: h(100), tags: ["Thumbnail"] }),
    item({ id: "c", kind: "internal", client: null, title: "Website copy", completedAt: h(200), tags: [] }),
  ];
  const ids = (f: Parameters<typeof filterHistory>[1]) => filterHistory(items, f).map((i) => i.id);
  assert.deepEqual(ids({ personId: "u2" }), ["b"]);
  assert.deepEqual(ids({ kind: "internal" }), ["c"]);
  assert.deepEqual(ids({ tag: "Thumbnail" }), ["b"]);
  assert.deepEqual(ids({ search: "website" }), ["c"]);
  assert.deepEqual(ids({ from: "2026-09-02" }), ["b", "c"]);
  assert.deepEqual(ids({ to: "2026-09-01" }), ["a"]);
  assert.deepEqual(ids({}), ["a", "b", "c"]);
});

test("a summary ranks by finished work and reads the middle task, not the mean", () => {
  const items = [
    item({ id: "a", completedAt: h(10), revisions: 1 }),
    item({ id: "b", completedAt: h(20), createdAt: h(0) }),
    item({ id: "c", personId: "u2", person: "Sparsh", completedAt: h(30), createdAt: h(28), dueDate: h(1) }),
  ];
  const rows = summarize(items, "person");
  assert.deepEqual(rows.map((r) => r.key), ["Narendra Mehta", "Sparsh"]);
  assert.equal(rows[0].completed, 2);
  assert.equal(rows[0].medianTurnaround, 15); // 10 and 20
  assert.equal(rows[0].revisionsPerTask, 0.5);
  assert.equal(rows[0].onTimePct, null); // nothing was due
  assert.equal(rows[1].onTimePct, 0); // finished after its due date
  assert.equal(median([3, 1, 2]), 2);
});

test("a task counts under each of its tags", () => {
  const rows = summarize([item({ tags: ["Reel", "Thumbnail"] })], "tag");
  assert.deepEqual(rows.map((r) => r.key).sort(), ["Reel", "Thumbnail"]);
  assert.deepEqual(summarize([item({ tags: [] })], "tag").map((r) => r.key), ["Untagged"]);
});

test("totals cover the whole filtered set", () => {
  // one due tomorrow (met), one that was due the day before (missed)
  const t = totals([item({ dueDate: h(24) }), item({ id: "b", personId: "u2", revisions: 2, dueDate: h(-24) })]);
  assert.equal(t.completed, 2);
  assert.equal(t.people, 2);
  assert.equal(t.revisionsPerTask, 1);
  assert.equal(t.onTimePct, 50);
});

test("client work is on time if it reached the client by the due date, however long the client took", () => {
  // due on the 2nd, with the client on the 1st, delivered on the 5th
  const reachedOnTime = item({ dueDate: h(30), handedOffAt: h(10), completedAt: h(100) });
  assert.equal(onTime(reachedOnTime), true);
  // reached the client after the due day: late, even if delivery was quick after
  assert.equal(onTime(item({ dueDate: h(10), handedOffAt: h(48), completedAt: h(50) })), false);
  // someone's own work has no client stage, so it's judged on completion
  assert.equal(onTime(item({ kind: "internal", dueDate: h(10), handedOffAt: null, completedAt: h(48) })), false);
});
