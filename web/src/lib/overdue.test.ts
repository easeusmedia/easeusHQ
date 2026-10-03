import { test } from "node:test";
import assert from "node:assert/strict";
import { needsAnswer, ordinal, overdueAudience, overdueText } from "./overdue.ts";

test("Level 3: their Level 2 hears every time; Level 1 from the third", () => {
  assert.deepEqual(overdueAudience(1, "employee"), { leads: true, levelOne: false });
  assert.deepEqual(overdueAudience(2, "employee"), { leads: true, levelOne: false });
  assert.deepEqual(overdueAudience(3, "employee"), { leads: true, levelOne: true });
});

test("Level 2: only them the first time; Level 1 from the second", () => {
  assert.deepEqual(overdueAudience(1, "core"), { leads: false, levelOne: false });
  assert.deepEqual(overdueAudience(2, "core"), { leads: false, levelOne: true });
  assert.deepEqual(overdueAudience(5, "admin"), { leads: false, levelOne: false });
});

test("ordinals", () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal), ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd"]);
});

test("overdue notices: clear, firmer as they repeat, always courteous", () => {
  const owner = (strike: number) => overdueText({ title: "Golden Pill", due: "29 Sep", strike, owner: "Narendra Mehta", toOwner: true });
  const lead = (strike: number) => overdueText({ title: "Golden Pill", due: "29 Sep", strike, owner: "Narendra Mehta", toOwner: false });
  assert.equal(owner(1), '"Golden Pill" was due on 29 Sep and isn\'t finished yet. Please set a new due date and add a short reason.');
  assert.match(owner(2), /second time it has slipped, so please make it a priority\.$/);
  assert.match(owner(3), /slipped 3 times, so please treat it as urgent\.$/);
  assert.equal(lead(1), 'Narendra\'s task "Golden Pill" was due on 29 Sep and isn\'t finished yet. Please check in with Narendra and help get it back on track.');
  assert.match(lead(2), /It has slipped twice\. Please check in/);
  assert.equal(overdueText({ title: "X", due: null, strike: 1, owner: null, toOwner: false }), 'A task "X" was due and isn\'t finished yet. Please check in and help get it back on track.');
});

test("an overdue notice locks the app once it's a day old and still about the same date", () => {
  const due = new Date("2026-10-01");
  const noticeAt = new Date("2026-10-02T03:00:00Z");
  const t = { dueDate: due, overdueFor: due, noticeAt };
  assert.equal(needsAnswer(t, new Date("2026-10-02T20:00:00Z")), false); // under a day
  assert.equal(needsAnswer(t, new Date("2026-10-03T03:00:01Z")), true); // over a day
  assert.equal(needsAnswer({ ...t, dueDate: new Date("2026-10-05") }, new Date("2026-10-04T00:00:00Z")), false); // moved since
  assert.equal(needsAnswer({ ...t, noticeAt: null }, new Date("2026-10-04T00:00:00Z")), false); // never told
});
