import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, CircleAlert, CircleCheck, UsersRound, Wallet } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { canEditPeople } from "@/lib/scope";
import { indiaDay } from "@/lib/due";
import { clientLogoSrc } from "@/lib/photos";
import { clientHref } from "@/lib/slug";
import { displayTeam, EMPLOYMENT_TYPE_LABEL } from "@/lib/teams";
import { collectedIn, ledger, PAYROLL_SHEET, type LedgerInvoice } from "@/lib/finance";
import { StatTile } from "../StatTile";
import { Avatar } from "../TaskCard";
import { PayrollSheet } from "./PayrollSheet";

export const dynamic = "force-dynamic";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const money = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const day = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

function cycle(c: { billingCadence: string | null; billingDayOfMonth: number | null; billingMilestoneCount: number | null }) {
  if (c.billingCadence === "monthly_date") return (c.billingDayOfMonth ?? 0) >= 28 ? "Monthly, month end" : `Monthly, day ${c.billingDayOfMonth}`;
  if (c.billingCadence === "milestone") return `Every ${c.billingMilestoneCount} deliverables`;
  return null;
}

function Heading({ title, note, children }: { title: string; note: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-0.5 text-xs text-muted">{note}</p>
      </div>
      {children}
    </div>
  );
}

// Money in and money out, as two separate books: clients pay through Skydo,
// the team is paid from the payroll sheet. The top line is the four numbers
// worth acting on; a client's invoices and rule live on their Billing tab.
export default async function FinancePage() {
  const id = await getSessionUserId();
  if (!id) redirect("/login");
  const me = await prisma.user.findUnique({ where: { id }, select: { role: true, email: true } });
  if (!me || !canEditPeople(me)) redirect("/board");

  const today = indiaDay(new Date());
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
        invoices: { select: { amount: true, status: true, dueDate: true, paidAt: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.user.findMany({
      where: { employment: { not: "former" } },
      include: { team: true, jobTitle: true },
      orderBy: { name: "asc" },
    }),
    prisma.appSetting.findUnique({ where: { key: PAYROLL_SHEET } }),
  ]);

  const toLedger = (i: (typeof clients)[number]["invoices"][number]): LedgerInvoice => ({
    amount: Number(i.amount),
    status: i.status,
    dueDate: i.dueDate ? indiaDay(i.dueDate) : null,
    paidAt: i.paidAt ? indiaDay(i.paidAt) : null,
  });
  const all = clients.flatMap((c) => c.invoices.map(toLedger));
  const total = ledger(all, today);
  const collected = collectedIn(all, today.slice(0, 7));

  // current clients, and any past one still owing; late and owing most first
  const rows = clients
    .map((c) => ({ c, l: ledger(c.invoices.map(toLedger), today) }))
    .filter(({ c, l }) => c.status === "current" || l.outstanding > 0)
    .sort((a, b) => b.l.overdue - a.l.overdue || b.l.outstanding - a.l.outstanding);

  const team = people
    .map((p) => ({ p, dept: displayTeam(p)?.name ?? null, salary: p.salary ? Number(p.salary) : null }))
    .sort((a, b) => (a.dept ?? "~").localeCompare(b.dept ?? "~") || a.p.name.localeCompare(b.p.name));
  const payroll = team.reduce((n, t) => n + (t.salary ?? 0), 0);
  const unset = team.filter((t) => t.salary === null).length;

  const CLIENT_ROW = "grid grid-cols-[minmax(0,1fr)_7rem_1rem] items-center gap-4 px-5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_7rem_6rem_6rem_1rem]";
  const TEAM_ROW = "grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-4 px-5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_6rem_7rem]";

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Finance</h1>
        <p className="mt-1.5 text-sm text-muted">What clients owe and what the team is paid, kept as two separate books.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Outstanding"
          value={money(total.outstanding)}
          lit={total.outstanding > 0}
          Icon={Wallet}
          note={<span className="text-xs text-muted">{total.unpaid ? `${total.unpaid} unpaid invoice${total.unpaid === 1 ? "" : "s"}` : "Nothing owed"}</span>}
        />
        <StatTile
          label="Overdue"
          value={money(total.overdueAmount)}
          lit={total.overdue > 0}
          Icon={CircleAlert}
          note={total.overdue > 0 && <span className="text-xs text-red-300">{total.overdue} past due</span>}
        />
        <StatTile label="Collected this month" value={money(collected)} lit={collected > 0} tone="emerald" Icon={CircleCheck} />
        <StatTile
          label="Monthly payroll"
          value={money(payroll)}
          lit={payroll > 0}
          Icon={UsersRound}
          note={unset > 0 && <span className="text-xs text-muted">{unset} without a salary set</span>}
        />
      </div>

      <section className="flex flex-col gap-3">
        <Heading title="Client payments" note="Paid through Skydo. Open a client for their invoices and billing rule.">
          <span
            title="Invoices and payments will come in from Skydo once its workflow is connected. Until then, mark an invoice paid on the client's Billing tab."
            className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted"
          >
            <span className="size-1.5 rounded-full bg-muted/60" /> Skydo not connected yet
          </span>
        </Heading>
        <div className="panel overflow-hidden rounded-2xl text-sm">
          <div className={`${CLIENT_ROW} py-2.5 text-xs text-muted`}>
            <span>Client</span>
            <span className="hidden sm:block">Billing cycle</span>
            <span className="text-right">Outstanding</span>
            <span className="hidden sm:block">Next due</span>
            <span className="hidden sm:block">Last paid</span>
            <span />
          </div>
          {rows.map(({ c, l }) => {
            const logo = clientLogoSrc(c);
            const rule = cycle(c);
            return (
              <Link
                key={c.id}
                href={`${clientHref(c)}?tab=billing`}
                className={`${CLIENT_ROW} group border-t border-border/50 py-3 transition-colors hover:bg-foreground/[0.02]`}
              >
                <span className="flex min-w-0 items-center gap-3">
                  {logo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a data: URI, not an optimizable remote asset
                    <img src={logo} alt="" className="photo shrink-0" style={{ width: 26, height: 26 }} />
                  ) : (
                    <Avatar name={c.name} size={26} presence={false} />
                  )}
                  <span className="truncate font-medium">{c.name}</span>
                </span>
                <span className={`hidden truncate sm:block ${rule ? "text-muted" : "text-muted/50"}`}>{rule ?? "Not set"}</span>
                <span className={`text-right tabular-nums ${l.outstanding ? "font-medium" : "text-muted/50"}`}>{l.outstanding ? money(l.outstanding) : "–"}</span>
                <span className={`hidden sm:block ${l.overdue ? "text-red-300" : "text-muted"}`}>
                  {l.overdue ? `${l.overdue} overdue` : l.nextDue ? day(l.nextDue) : "–"}
                </span>
                <span className="hidden text-muted sm:block">{l.lastPaid ? day(l.lastPaid) : "–"}</span>
                <ArrowUpRight size={14} className="text-muted opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <Heading title="Team pay" note="Paid from the payroll sheet, separately from client payments. Salaries are set on each person's profile.">
          <PayrollSheet url={sheet?.value ?? null} />
        </Heading>
        <div className="panel overflow-hidden rounded-2xl text-sm">
          <div className={`${TEAM_ROW} py-2.5 text-xs text-muted`}>
            <span>Person</span>
            <span className="hidden sm:block">Position</span>
            <span className="hidden sm:block">Department</span>
            <span className="hidden sm:block">Type</span>
            <span className="text-right">Monthly salary</span>
          </div>
          {team.map(({ p, dept, salary }) => (
            <Link
              key={p.id}
              href={`/team?person=${p.id}`}
              className={`${TEAM_ROW} border-t border-border/50 py-3 transition-colors hover:bg-foreground/[0.02]`}
            >
              <span className="flex min-w-0 items-center gap-3">
                <Avatar name={p.name} size={26} presence={false} />
                <span className="truncate font-medium">{p.name}</span>
                {p.employment === "on_leave" && <span className="shrink-0 text-xs text-amber-300">On leave</span>}
              </span>
              <span className="hidden truncate text-muted sm:block">{p.jobTitle?.name ?? "–"}</span>
              <span className="hidden truncate text-muted sm:block">{dept ?? "–"}</span>
              <span className="hidden truncate text-muted sm:block">{p.employmentType ? EMPLOYMENT_TYPE_LABEL[p.employmentType] : "–"}</span>
              <span className={`text-right tabular-nums ${salary === null ? "text-muted/50" : ""}`}>{salary === null ? "Not set" : money(salary)}</span>
            </Link>
          ))}
          <div className={`${TEAM_ROW} border-t border-border py-3 text-xs text-muted`}>
            <span>{team.length} people</span>
            <span className="hidden sm:block" />
            <span className="hidden sm:block" />
            <span className="hidden sm:block" />
            <span className="text-right text-sm font-medium tabular-nums text-foreground">{money(payroll)}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
