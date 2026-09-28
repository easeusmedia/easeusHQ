import { prisma } from "@/lib/prisma";
import { indiaDay } from "@/lib/due";
import { displayTeam } from "@/lib/teams";
import { PAYROLL_SHEET, type LedgerInvoice } from "@/lib/finance";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "₹2,73,000", "$1,200"
export const money = (n: number, currency = "INR") =>
  new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
// "12 Sep", with the year only when it isn't this one
export const day = (iso: string, thisYear = new Date().getFullYear().toString()) =>
  `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}${iso.startsWith(thisYear) ? "" : ` ${iso.slice(0, 4)}`}`;
export const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
export const prevMonth = (ym: string) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);

export const INVOICE_STATUS: Record<string, string> = { draft: "Draft", ready: "Ready to send", sent: "Sent", paid: "Paid", overdue: "Overdue" };
export const PAY_STRUCTURE: Record<string, string> = { fixed: "Fixed monthly", per_video: "Per video", hourly: "Hourly" };
export const PAY_CYCLE: Record<string, string> = { monthly: "Monthly", fortnightly: "Fortnightly", weekly: "Weekly" };

export function billingCycle(c: { billingCadence: string | null; billingDayOfMonth: number | null; billingMilestoneCount: number | null }) {
  if (c.billingCadence === "monthly_date") return (c.billingDayOfMonth ?? 0) >= 28 ? "Monthly, month end" : `Monthly, day ${c.billingDayOfMonth}`;
  if (c.billingCadence === "milestone") return `Every ${c.billingMilestoneCount} deliverables`;
  return null;
}

export type Inv = LedgerInvoice & {
  id: string;
  number: string | null;
  currency: string;
  source: string;
  raised: string;
  client: { id: string; slug: string; name: string };
};

// Both books at once: every client and invoice, and everyone on the payroll
// with what they're due and what's been paid this month and last.
export async function loadFinance() {
  const today = indiaDay(new Date());
  const month = today.slice(0, 7);
  const last = prevMonth(month);
  const [clients, people, sheet] = await Promise.all([
    prisma.client.findMany({
      where: { OR: [{ status: "current" }, { invoices: { some: {} } }] },
      select: {
        id: true,
        slug: true,
        name: true,
        avatarUrl: true,
        status: true,
        billingCadence: true,
        billingDayOfMonth: true,
        billingMilestoneCount: true,
        invoices: { orderBy: { createdAt: "desc" } },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.user.findMany({
      where: { employment: { not: "former" } },
      include: { team: true, jobTitle: true, salaryPayments: { where: { period: { in: [month, last] } } } },
      orderBy: { name: "asc" },
    }),
    prisma.appSetting.findUnique({ where: { key: PAYROLL_SHEET } }),
  ]);

  const invoices: Inv[] = clients
    .flatMap((c) =>
      c.invoices.map((i) => ({
        id: i.id,
        number: i.number,
        currency: i.currency,
        source: i.source,
        amount: Number(i.amount),
        status: i.status,
        dueDate: i.dueDate ? indiaDay(i.dueDate) : null,
        paidAt: i.paidAt ? indiaDay(i.paidAt) : null,
        raised: indiaDay(i.createdAt),
        client: { id: c.id, slug: c.slug, name: c.name },
      }))
    )
    .sort((a, b) => b.raised.localeCompare(a.raised));

  // what each person is due for a month: the amount recorded for it, else
  // their salary as it stands
  const team = people
    .map((p) => {
      const salary = p.salary ? Number(p.salary) : null;
      const of = (ym: string) => {
        const row = p.salaryPayments.find((s) => s.period === ym);
        return {
          due: row ? Number(row.amount) : (salary ?? 0),
          paid: row ? Number(row.paid) : 0,
          paidAt: row?.paidAt ? indiaDay(row.paidAt) : null,
          recorded: !!row,
        };
      };
      return { p, dept: displayTeam(p)?.name ?? null, salary, now: of(month), last: of(last) };
    })
    .sort((a, b) => (a.dept ?? "~").localeCompare(b.dept ?? "~") || a.p.name.localeCompare(b.p.name));

  return { today, month, last, clients, invoices, team, sheet: sheet?.value ?? null };
}
