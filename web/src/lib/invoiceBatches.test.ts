import { test } from "node:test";
import assert from "node:assert/strict";
import { batchPayment, invoiceBatches } from "./invoiceBatches.ts";

const p = (id: string, date: string) => ({ id, date });

test("every 4 projects: batches counted oldest first, newest shown first, last one partial", () => {
  const items = ["01", "02", "03", "04", "05", "06"].map((d, i) => p(`p${i + 1}`, `2026-05-${d}`)).reverse();
  const b = invoiceBatches(items, { cadence: "milestone", dayOfMonth: null, every: 4 }, "2026-09-17");
  assert.deepEqual(b.map((x) => [x.label, x.detail]), [
    ["Current invoice", "2 of 4 done"],
    ["Invoice 1", "1 May – 4 May"],
  ]);
  assert.deepEqual(b[1].ids, ["p1", "p2", "p3", "p4"]);
  assert.equal(b[0].complete, false);
  assert.equal(b[1].complete, true);
});

test("month end: calendar months, the 31st stays in its own month", () => {
  const items = [p("a", "2026-08-12"), p("b", "2026-08-31"), p("c", "2026-09-04"), p("d", "2026-07-18")];
  const b = invoiceBatches(items, { cadence: "monthly_date", dayOfMonth: 30, every: null }, "2026-09-17");
  assert.deepEqual(b.map((x) => [x.label, x.detail, x.ids.join()]), [
    ["Sep 2026", "1 project, not invoiced yet", "c"],
    ["Aug 2026", "2 projects", "a,b"],
    ["Jul 2026", "1 project", "d"],
  ]);
  assert.equal(b[0].complete, false); // September's invoice hasn't gone out yet
  assert.equal(b[1].complete, true);
});

test("a mid-month invoice day: anything after it rolls into next month's invoice", () => {
  const items = [p("a", "2026-08-15"), p("b", "2026-08-16"), p("c", "2026-12-20")];
  const b = invoiceBatches(items, { cadence: "monthly_date", dayOfMonth: 15, every: null }, "2026-09-17");
  assert.deepEqual(b.map((x) => [x.key, x.label, x.ids.join()]), [
    ["2027-01", "16 Dec – 15 Jan 2027", "c"],
    ["2026-09", "16 Aug – 15 Sep 2026", "b"],
    ["2026-08", "16 Jul – 15 Aug 2026", "a"],
  ]);
});

test("no rule, no batches", () => {
  assert.deepEqual(invoiceBatches([p("a", "2026-08-01")], { cadence: null, dayOfMonth: null, every: null }, "2026-09-17"), []);
});

test("an invoice spanning into another year says which", () => {
  const items = [p("a", "2025-12-20"), p("b", "2026-01-05")];
  const b = invoiceBatches(items, { cadence: "milestone", dayOfMonth: null, every: 2 }, "2026-09-17");
  assert.equal(b[0].detail, "20 Dec 2025 – 5 Jan");
});

test("an invoice's payment comes from its projects; unrecorded ones don't count against it", () => {
  assert.equal(batchPayment(["paid", "paid", null, "paid"], true), "paid");
  assert.equal(batchPayment(["paid", "unpaid"], true), "part_paid");
  assert.equal(batchPayment(["unpaid", null], true), "unpaid");
  assert.equal(batchPayment([null, null], true), "not_marked");
  // an invoice that hasn't gone out yet isn't owed
  assert.equal(batchPayment(["unpaid", "unpaid"], false), "not_sent");
  assert.equal(batchPayment(["paid"], false), "paid");
});
