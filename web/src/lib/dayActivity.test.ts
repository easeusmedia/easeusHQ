import { test } from "node:test";
import assert from "node:assert/strict";
import { dayBounds, groupDay, isDay, type DayEvent, type DayTask } from "./dayActivity.ts";

// a moment in India
const ist = (s: string) => new Date(`2026-10-${s}+05:30`);
const reel: DayTask = { kind: "task", id: "t1", title: "Weekly recap", where: "Northwind Wellness", workflow: "video" };
const todo: DayTask = { kind: "work", id: "w1", title: "Update the lead tracker", where: null };
const names = new Map([["nar", "Narendra"], ["ash", "Ashmit"]]);

test("an IST day runs from midnight to midnight in India", () => {
  const { from, to } = dayBounds("2026-10-26");
  assert.equal(from.toISOString(), "2026-10-25T18:30:00.000Z");
  assert.equal(to.toISOString(), "2026-10-26T18:30:00.000Z");
});

test("only a real day counts as one", () => {
  assert.equal(isDay("2026-10-19"), true);
  for (const s of ["2026-13-45", "2026-02-30", "2026-10-1", "", null, undefined]) assert.equal(isDay(s), false, String(s));
});

test("the day's work, by person: each task once, its lines in time order, the busiest first", () => {
  const events: DayEvent[] = [
    { personId: "nar", at: ist("26T16:05:00"), task: reel, what: "move", from: "editing", to: "sent_for_approval" },
    { personId: "nar", at: ist("26T10:00:00"), task: reel, what: "move", from: "queued", to: "editing" },
    { personId: "ash", at: ist("26T12:00:00"), task: todo, what: "completed" },
    { personId: "nar", at: ist("26T11:30:00"), task: { ...reel, id: "t2", title: "Trailer" }, what: "created" },
    // the IST day's edges: 00:10 on the 26th counts, 00:10 on the 27th and 23:50 on the 25th don't
    { personId: "ash", at: ist("26T00:10:00"), task: todo, what: "date", from: new Date("2026-10-24"), to: new Date("2026-10-27"), reason: "Client asked for more time" },
    { personId: "ash", at: ist("27T00:10:00"), task: todo, what: "created" },
    { personId: "nar", at: ist("25T23:50:00"), task: reel, what: "created" },
  ];
  const day = groupDay("2026-10-26", events, names);
  assert.deepEqual(
    day.map((p) => [p.name, p.tasks.map((t) => [t.title, t.lines.map((l) => `${l.text}, ${l.time}`)])]),
    [
      ["Narendra", [["Weekly recap", ["Queued → Editing, 10:00 am", "Editing → Sent for approval, 4:05 pm"]], ["Trailer", ["Created, 11:30 am"]]]],
      ["Ashmit", [["Update the lead tracker", ["Due date moved from 24 Oct to 27 Oct, 12:10 am", "Completed, 12:00 pm"]]]],
    ]
  );
  assert.equal(day[1].tasks[0].lines[0].note, "Client asked for more time");
});

test("a stage put straight back, a late tick and an unknown person read plainly", () => {
  const day = groupDay(
    "2026-10-26",
    [
      { personId: "nar", at: ist("26T10:00:00"), task: reel, what: "move", from: "editing", to: "revision_requested" },
      { personId: "nar", at: ist("26T10:01:00"), task: reel, what: "move", from: "revision_requested", to: "editing" },
      { personId: "x", at: ist("26T09:00:00"), task: todo, what: "date", from: new Date("2026-10-24"), to: new Date("2026-10-24"), reason: "" },
    ],
    names
  );
  assert.deepEqual(day.map((p) => [p.name, p.tasks[0].lines.map((l) => [l.text, l.note])]), [["Someone", [["Ticked off late", null]]]]);
});
