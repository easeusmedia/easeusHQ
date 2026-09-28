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

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// still owed and due within the next `days` days (today included)
export function upcoming(invoices: LedgerInvoice[], today: string, days = 30) {
  const soon = invoices.filter((i) => isUnpaid(i) && i.dueDate && i.dueDate >= today && i.dueDate <= addDays(today, days));
  return { count: soon.length, amount: sum(soon) };
}

// ---- the team's pay: one person's month, due against paid ----

export type PayMonth = { due: number; paid: number };

export function payState({ due, paid }: PayMonth): "paid" | "partial" | "pending" {
  if (due > 0 && paid >= due) return "paid";
  return paid > 0 ? "partial" : "pending";
}

// a month's payroll: what's owed across everyone, what's gone out, what's left
export function payroll(months: PayMonth[]) {
  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    obligations: r(months.reduce((n, m) => n + m.due, 0)),
    paid: r(months.reduce((n, m) => n + Math.min(m.paid, m.due || m.paid), 0)),
    pending: r(months.reduce((n, m) => n + Math.max(0, m.due - m.paid), 0)),
  };
}
