import { test } from "node:test";
import assert from "node:assert/strict";
import { inHand, activeHours, currentStatuses, filterHistory, median, onTime, pageOfDone, spanLabel, stagePhases, startOf, summarize, totals, turnaroundHours, windowful, type HistoryItem } from "./history.ts";

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

test("an import that arrived already with the client isn't scored either way", () => {
  // stamped with its own creation instant: nobody saw it reach the client
  assert.equal(onTime(item({ dueDate: h(10), createdAt: h(50), handedOffAt: h(50), completedAt: h(60) })), null);
});

test("Team work: what counts as someone's current work, by their level", () => {
  assert.deepEqual(currentStatuses(true), ["editing", "revision_requested"]);
  const lead = currentStatuses(false);
  assert.ok(lead.includes("queued") && lead.includes("sent_for_client_approval"));
  assert.ok(!lead.includes("final_export_ready") && !lead.includes("delivered_and_uploaded"));
});

test("Team work: work starts at its first move into Editing, else its first move, else when it was made", () => {
  const trail = [
    { action: "created", at: h(0) },
    { action: "queued → sent_for_approval", at: h(3) },
    { action: "sent_for_approval → editing", at: h(5) },
  ];
  assert.equal(startOf(trail, h(-1)).getTime(), h(5).getTime());
  assert.equal(startOf(trail.slice(0, 2), h(-1)).getTime(), h(3).getTime());
  assert.equal(startOf([], h(-1)).getTime(), h(-1).getTime());
  // straight to Delivered (a to-do ticked done): it began when it was made
  assert.equal(startOf([{ action: "queued → delivered_and_uploaded", at: h(70) }], h(-1)).getTime(), h(-1).getTime());
});

test("Team work: turnaround reads in days, or hours under a day", () => {
  const H = 3_600_000;
  assert.equal(spanLabel(20 * 60_000), "Under 1 h");
  assert.equal(spanLabel(5 * H), "5 h");
  assert.equal(spanLabel(23.6 * H), "1 day");
  assert.equal(spanLabel(3 * 24 * H + 2 * H), "3 days");
  assert.equal(spanLabel(-H), "Under 1 h");
});

test("Team work: finished work pages newest first and counts what a range of days holds", () => {
  // 20:00 UTC on the 1st is the 2nd in India
  const done = [
    { kind: "task" as const, id: "a", at: h(2) },
    { kind: "work" as const, id: "b", at: h(20) },
    { kind: "task" as const, id: "c", at: h(50) },
    { kind: "work" as const, id: "d", at: h(80) },
  ];
  const ids = (r: ReturnType<typeof pageOfDone>) => r.page.map((d) => d.id);
  assert.deepEqual(ids(pageOfDone(done, { offset: 0, limit: 2 })), ["d", "c"]);
  assert.deepEqual(ids(pageOfDone(done, { offset: 2, limit: 2 })), ["b", "a"]);
  assert.equal(pageOfDone(done, { offset: 4, limit: 2 }).page.length, 0);
  const range = pageOfDone(done, { from: "2026-09-02", to: "2026-09-03", offset: 0, limit: 10 });
  assert.equal(range.total, 2);
  assert.deepEqual(ids(range), ["c", "b"]);
});

test("Team work: a window's worth fills the list's space with rows, never fewer than ten", () => {
  assert.equal(windowful(900, 44), 21);
  assert.equal(windowful(1600, 76), 22);
  assert.equal(windowful(300, 44), 10);
  assert.equal(windowful(-40, 44), 10);
});

test("Team work: a task's phases, with who moved it and how long each lasted", () => {
  const trail = [
    { action: "queued → editing", at: h(2), by: "Riya" },
    { action: "editing → sent_for_approval (from Notion)", at: h(10), by: "Abhishek" },
    { action: "sent_for_approval → delivered_and_uploaded", at: h(12), by: "Abhishek" },
  ];
  const phases = stagePhases(trail, h(0), "delivered_and_uploaded", h(100));
  assert.deepEqual(phases.map((p) => [p.stage, p.by, p.ms === null ? null : p.ms / 3_600_000]), [
    ["queued", null, 2],
    ["editing", "Riya", 8],
    ["sent_for_approval", "Notion", 2],
    ["delivered_and_uploaded", "Abhishek", null],
  ]);
  // still going: the stage it's in runs on to now; never moved, it's where it started
  assert.equal(stagePhases(trail.slice(0, 1), h(0), "editing", h(5))[1].ms, 3 * 3_600_000);
  assert.deepEqual(stagePhases([], h(0), "queued", h(4)).map((p) => [p.stage, p.ms]), [["queued", 4 * 3_600_000]]);
  // moves from before the task was made here (an import): it began at the first
  assert.equal(stagePhases(trail, h(5), "delivered_and_uploaded", h(100))[0].ms, 0);
});

test("a Level 3 in Production: only what's in hand", () => {
  const today = "2026-10-26";
  // set for today, or late: shown, while it's with them
  assert.equal(inHand({ kind: "task", status: "editing", due: "2026-10-26" }, today), true);
  assert.equal(inHand({ kind: "task", status: "queued", due: "2026-10-26" }, today), true);
  assert.equal(inHand({ kind: "task", status: "revision_requested", due: "2026-10-24" }, today), true);
  assert.equal(inHand({ kind: "work", status: "todo", due: "2026-10-26" }, today), true);
  assert.equal(inHand({ kind: "work", status: "in_progress", due: "2026-10-20" }, today), true);
  // set for a later day: not yet, whatever its stage
  assert.equal(inHand({ kind: "task", status: "editing", due: "2026-10-27" }, today), false);
  assert.equal(inHand({ kind: "task", status: "queued", due: "2026-10-27" }, today), false);
  assert.equal(inHand({ kind: "work", status: "in_progress", due: "2026-11-01" }, today), false);
  // with someone else for approval, or past it: never
  assert.equal(inHand({ kind: "task", status: "sent_for_approval", due: "2026-10-26" }, today), false);
  assert.equal(inHand({ kind: "task", status: "sent_for_client_approval", due: "2026-10-20" }, today), false);
  assert.equal(inHand({ kind: "task", status: "final_export_ready", due: "2026-10-26" }, today), false);
  assert.equal(inHand({ kind: "work", status: "in_review", due: "2026-10-26" }, today), false);
  // no date: only while they're actually on it
  assert.equal(inHand({ kind: "task", status: "editing", due: null }, today), true);
  assert.equal(inHand({ kind: "task", status: "queued", due: null }, today), false);
  assert.equal(inHand({ kind: "work", status: "in_progress", due: null }, today), true);
  assert.equal(inHand({ kind: "work", status: "todo", due: null }, today), false);
});
