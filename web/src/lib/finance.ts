// What a set of invoices adds up to, for the Finance page: what's owed,
// what's late, what came in. Pure (dates are India days, yyyy-mm-dd) so the
// money arithmetic is testable on its own.

// the AppSetting holding the team payroll spreadsheet's link
export const PAYROLL_SHEET = "finance.payrollSheet";

export type LedgerInvoice = {
  amount: number;
  status: "draft" | "ready" | "sent" | "paid" | "overdue";
  dueDate: string | null;
  paidAt: string | null;
};

// a draft hasn't gone to the client yet, so nothing is owed on it
const UNPAID = ["ready", "sent", "overdue"];
const sum = (list: LedgerInvoice[]) => Math.round(list.reduce((n, i) => n + i.amount, 0) * 100) / 100;

export const isUnpaid = (inv: LedgerInvoice) => UNPAID.includes(inv.status);

// marked overdue by hand, or still owed after its due day
export function isOverdue(inv: LedgerInvoice, today: string): boolean {
  return inv.status === "overdue" || (isUnpaid(inv) && !!inv.dueDate && inv.dueDate < today);
}

export function ledger(invoices: LedgerInvoice[], today: string) {
  const unpaid = invoices.filter(isUnpaid);
  const late = unpaid.filter((i) => isOverdue(i, today));
  return {
    outstanding: sum(unpaid),
    unpaid: unpaid.length,
    overdue: late.length,
    overdueAmount: sum(late),
    nextDue: unpaid.flatMap((i) => i.dueDate ?? []).sort()[0] ?? null,
    lastPaid: invoices.flatMap((i) => (i.status === "paid" && i.paidAt ? i.paidAt : [])).sort().at(-1) ?? null,
  };
}

// paid within a month ("2026-09")
export function collectedIn(invoices: LedgerInvoice[], month: string): number {
  return sum(invoices.filter((i) => i.status === "paid" && i.paidAt?.startsWith(month)));
}
