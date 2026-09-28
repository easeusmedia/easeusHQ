import { test } from "node:test";
import assert from "node:assert/strict";
import { collectedIn, isOverdue, ledger, payroll, payState, upcoming, type LedgerInvoice } from "./finance.ts";

const inv = (amount: number, status: LedgerInvoice["status"], dueDate: string | null = null, paidAt: string | null = null): LedgerInvoice => ({
  amount,
  status,
  dueDate,
  paidAt,
});

test("drafts owe nothing; ready, sent and overdue do", () => {
  const l = ledger([inv(100, "draft"), inv(200.1, "ready"), inv(300.2, "sent"), inv(50, "overdue"), inv(999, "paid", null, "2026-09-02")], "2026-09-29");
  assert.equal(l.outstanding, 550.3);
  assert.equal(l.unpaid, 3);
});

test("still owed after its due day is overdue, whatever its status says", () => {
  assert.equal(isOverdue(inv(1, "sent", "2026-09-28"), "2026-09-29"), true);
  assert.equal(isOverdue(inv(1, "sent", "2026-09-29"), "2026-09-29"), false);
  assert.equal(isOverdue(inv(1, "paid", "2026-01-01"), "2026-09-29"), false);
  assert.equal(isOverdue(inv(1, "draft", "2026-01-01"), "2026-09-29"), false);
  const l = ledger([inv(10, "sent", "2026-09-01"), inv(20, "overdue"), inv(40, "ready", "2026-10-05")], "2026-09-29");
  assert.deepEqual([l.overdue, l.overdueAmount, l.nextDue], [2, 30, "2026-09-01"]);
});

test("collected counts what was paid in that month, and the last payment is the latest", () => {
  const list = [inv(10, "paid", null, "2026-09-01"), inv(5, "paid", null, "2026-09-30"), inv(7, "paid", null, "2026-08-31"), inv(3, "sent")];
  assert.equal(collectedIn(list, "2026-09"), 15);
  assert.equal(ledger(list, "2026-09-29").lastPaid, "2026-09-30");
});

test("upcoming: owed and due within the window, today included", () => {
  const list = [inv(10, "sent", "2026-09-29"), inv(20, "ready", "2026-10-29"), inv(40, "sent", "2026-10-30"), inv(80, "paid", "2026-10-01", "2026-09-01"), inv(5, "sent", "2026-09-28")];
  assert.deepEqual(upcoming(list, "2026-09-29"), { count: 2, amount: 30 });
});

test("payroll: paid, partly paid and pending; overpaying one person doesn't hide another's shortfall", () => {
  assert.equal(payState({ due: 100, paid: 100 }), "paid");
  assert.equal(payState({ due: 100, paid: 40 }), "partial");
  assert.equal(payState({ due: 100, paid: 0 }), "pending");
  assert.deepEqual(payroll([{ due: 100, paid: 150 }, { due: 200, paid: 50 }, { due: 50, paid: 0 }]), { obligations: 350, paid: 150, pending: 200 });
});
