import { test } from "node:test";
import assert from "node:assert/strict";
import { period } from "./mailPeriod.ts";

// Friday 9 Oct 2026, 12:30 in India (07:00 UTC), as Mailsuite showed it that day
const now = new Date("2026-10-09T07:00:00Z");
const ist = (d: Date) => new Date(d.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 16);

test("Mailsuite's periods: yesterday, last week (Monday to Sunday), last month, last year", () => {
  const day = period("day", now);
  assert.deepEqual([ist(day.start), ist(day.end), day.label], ["2026-10-08T00:00", "2026-10-09T00:00", "8 Oct 2026"]);
  assert.equal(ist(day.prevStart), "2026-10-07T00:00");

  const week = period("week", now);
  assert.deepEqual([ist(week.start), ist(week.end), week.label], ["2026-09-28T00:00", "2026-10-05T00:00", "28 Sept to 4 Oct 2026"]);
  assert.equal(week.prevLabel, "21 Sept to 27 Sept 2026");

  const month = period("month", now);
  assert.deepEqual([ist(month.start), ist(month.end), month.label, month.prevLabel], ["2026-09-01T00:00", "2026-10-01T00:00", "September 2026", "August 2026"]);

  const year = period("year", now);
  assert.deepEqual([ist(year.start), ist(year.end), year.label], ["2025-01-01T00:00", "2026-01-01T00:00", "2025"]);
});

test("a Monday's last week is the one just ended; January's last month is December", () => {
  const monday = new Date("2026-10-05T03:00:00Z");
  assert.equal(period("week", monday).label, "28 Sept to 4 Oct 2026");
  const jan = new Date("2027-01-15T06:00:00Z");
  assert.equal(period("month", jan).label, "December 2026");
});
