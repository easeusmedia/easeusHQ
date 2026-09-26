import { test } from "node:test";
import assert from "node:assert/strict";
import { daysLate, dueState, handedOffStamp, reachesClient } from "./due.ts";

// 26 September, the way a due date is stored: midnight UTC on the day
const DUE = new Date("2026-09-26");
// a moment on a given IST day, at 3pm India time
const ist = (day: string) => new Date(`${day}T09:30:00Z`);

test("before the day, on the day, after it — while it hasn't reached the client", () => {
  assert.equal(dueState(DUE, null, ist("2026-09-24")), "upcoming");
  assert.equal(dueState(DUE, null, ist("2026-09-26")), "today");
  assert.equal(dueState(DUE, null, ist("2026-09-27")), "overdue");
});

test("once it's reached the client, the deadline is met — whatever happens next", () => {
  // the whole point: sitting with the client past the due date is not the
  // editor being late
  assert.equal(dueState(DUE, ist("2026-09-25"), ist("2026-10-02")), "met");
  assert.equal(dueState(DUE, ist("2026-09-26"), ist("2026-10-02")), "met"); // on the day counts
  assert.equal(dueState(DUE, ist("2026-09-28"), ist("2026-10-02")), "late");
  assert.equal(daysLate(DUE, ist("2026-09-28")), 2);
  assert.equal(daysLate(DUE, ist("2026-09-25")), 0);
});

test("the day is India's, not the server's", () => {
  // 20:00 UTC on the 26th is 01:30 on the 27th in India — a day late there
  assert.equal(dueState(DUE, new Date("2026-09-26T20:00:00Z")), "late");
  // and 22:00 UTC on the 25th is 03:30 on the 26th — on time
  assert.equal(dueState(DUE, new Date("2026-09-25T22:00:00Z")), "met");
  // "today" follows India too: 19:00 UTC on the 25th is already the 26th
  assert.equal(dueState(DUE, null, new Date("2026-09-25T19:00:00Z")), "today");
});

test("no due date, nothing to judge", () => {
  assert.equal(dueState(null, null), null);
  assert.equal(dueState(null, ist("2026-09-25")), null);
});

test("the first arrival at the client is what's recorded", () => {
  const now = ist("2026-09-25");
  assert.equal(handedOffStamp(null, "sent_for_client_approval", now), now);
  // internal work that skips the client entirely still hands off
  assert.equal(handedOffStamp(null, "final_export_ready", now), now);
  assert.equal(handedOffStamp(null, "delivered_and_uploaded", now), now);
});

test("our own review stages don't count as reaching the client", () => {
  const now = ist("2026-09-25");
  for (const s of ["queued", "editing", "sent_for_approval", "revision_requested"] as const) {
    assert.equal(handedOffStamp(null, s, now), null, s);
    assert.equal(reachesClient(s), false, s);
  }
});

test("a client revision afterwards never moves or clears the record", () => {
  const first = ist("2026-09-25");
  const later = ist("2026-09-30");
  // the client asks for changes: back to revision, then editing, then out again
  assert.equal(handedOffStamp(first, "revision_requested", later), first);
  assert.equal(handedOffStamp(first, "editing", later), first);
  assert.equal(handedOffStamp(first, "sent_for_client_approval", later), first);
  // so a task delivered long after its due date still counts as met
  assert.equal(dueState(DUE, handedOffStamp(first, "delivered_and_uploaded", later)), "met");
});
