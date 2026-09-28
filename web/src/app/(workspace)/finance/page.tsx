import Link from "next/link";
import { ArrowUpRight, CalendarClock, Check, CircleAlert, CircleCheck, Hourglass, Receipt, Sheet, Wallet } from "lucide-react";
import { clientLogoSrc } from "@/lib/photos";
import { clientHref } from "@/lib/slug";
import { EMPLOYMENT_TYPE_LABEL } from "@/lib/teams";
import { collectedIn, isOverdue, ledger, payroll, payState, upcoming } from "@/lib/finance";
import { StatTile } from "../StatTile";
import { Avatar } from "../TaskCard";
import { ClientTabs } from "../clients/ClientTabs";
import { PayrollSheet } from "./PayrollSheet";
import { requireFinance } from "./access";
import { billingCycle, day, INVOICE_STATUS, loadFinance, money, monthLabel, PAY_STRUCTURE } from "./data";

export const dynamic = "force-dynamic";

const PAY_PILL = {
  paid: "text-foreground",
  partial: "text-foreground/80",
  pending: "text-muted",
} as const;
const PAY_LABEL = { paid: "Paid", partial: "Part paid", pending: "Pending" } as const;

function Group({ title, source, children }: { title: string; source: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {source}
      </div>
      {children}
    </section>
  );
}

function Source({ label, on }: { label: string; on: boolean }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted">
      <span className={`size-1.5 rounded-full ${on ? "bg-accent" : "bg-muted/60"}`} /> {label}
    </span>
  );
}

// Money in and money out, kept as the two separate books they are: clients
// pay through Skydo, the team is paid from the payroll sheet. The overview
// is the handful of numbers worth acting on; each tab lists one book, and
// every row opens the detail behind it.
export default async function FinancePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireFinance();
  const { today, month, last, clients, invoices, team, sheet } = await loadFinance();
  const { tab } = await searchParams;

  // Totals are in rupees; anything raised in another currency is counted on its own
  const inr = invoices.filter((i) => i.currency === "INR");
  const foreign = invoices.filter((i) => i.currency !== "INR");
  const total = ledger(inr, today);
  const collected = collectedIn(inr, month);
  const yearSoFar = inr.filter((i) => i.status === "paid" && i.paidAt?.startsWith(today.slice(0, 4))).reduce((n, i) => n + i.amount, 0);
  const soon = upcoming(inr, today);

  const paid = team.filter((t) => t.salary !== null || t.now.paid > 0);
  const pay = payroll(paid.map((t) => t.now));
  const pendingPeople = paid.filter((t) => payState(t.now) !== "paid").length;
  // only a month someone started recording and left short: pay kept in the
  // sheet isn't recorded here, and isn't something to chase
  const lastUnpaid = paid.filter((t) => t.last.recorded && payState(t.last) !== "paid");

  const attention = [
    ...invoices
      .filter((i) => isOverdue(i, today))
      .map((i) => ({ key: i.id, href: `/finance/invoices/${i.id}`, title: `${i.client.name}: ${money(i.amount, i.currency)} overdue`, note: i.dueDate ? `Was due ${day(i.dueDate)}` : "Marked overdue" })),
    ...lastUnpaid.map((t) => ({
      key: t.p.id,
      href: `/finance/team/${t.p.id}`,
      title: `${t.p.name}: ${monthLabel(last)} pay part paid`,
      note: `${money(Math.max(0, t.last.due - t.last.paid))} left`,
    })),
  ];

  const CLIENT_ROW = "grid grid-cols-[minmax(0,1fr)_7rem_1rem] items-center gap-4 px-5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_7rem_7rem_6rem_1rem]";
  const INVOICE_ROW = "grid grid-cols-[minmax(0,1fr)_6.5rem_6.5rem] items-center gap-4 px-5 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_7rem_7rem_6rem_6rem]";
  const TEAM_ROW = "grid grid-cols-[minmax(0,1fr)_7rem_5.5rem] items-center gap-4 px-5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_7rem_7rem_6rem_5.5rem]";
  const empty = (text: string) => <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">{text}</p>;

  const overview = (
    <div className="flex flex-col gap-8">
      <Group title="Clients" source={<Source label="Skydo not connected yet" on={false} />}>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile
            label="Collected this month"
            value={money(collected)}
            lit={collected > 0}
            Icon={CircleCheck}
            note={<span className="text-xs text-muted">{money(yearSoFar)} so far this year</span>}
          />
          <StatTile
            label="Outstanding"
            value={money(total.outstanding)}
            lit={total.outstanding > 0}
            Icon={Wallet}
            note={
              <span className="text-xs text-muted">
                {total.unpaid ? `${total.unpaid} unpaid` : "Nothing owed"}
                {total.overdue > 0 && <span className="text-red-300"> · {total.overdue} overdue</span>}
              </span>
            }
          />
          <StatTile
            label="Coming up, next 30 days"
            value={money(soon.amount)}
            lit={soon.count > 0}
            Icon={CalendarClock}
            note={<span className="text-xs text-muted">{soon.count ? `${soon.count} invoice${soon.count === 1 ? "" : "s"} due` : "Nothing due"}</span>}
          />
        </div>
        {foreign.length > 0 && <p className="text-xs text-muted">Totals are in rupees. {foreign.length} invoice{foreign.length === 1 ? " is" : "s are"} in another currency; see Invoices.</p>}
      </Group>

      <Group title={`Team, ${monthLabel(month)}`} source={<Source label={sheet ? "Payroll sheet linked" : "Payroll sheet not linked"} on={!!sheet} />}>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile label="Salaries due" value={money(pay.obligations)} lit={pay.obligations > 0} Icon={Receipt} note={<span className="text-xs text-muted">{paid.length} people</span>} />
          <StatTile label="Paid" value={money(pay.paid)} lit={pay.paid > 0} Icon={CircleCheck} />
          <StatTile
            label="Pending"
            value={money(pay.pending)}
            lit={pay.pending > 0}
            Icon={Hourglass}
            note={<span className="text-xs text-muted">{pendingPeople ? `${pendingPeople} not recorded as paid yet` : "Everyone's paid"}</span>}
          />
        </div>
      </Group>

      <Group title="Needs attention" source={null}>
        {attention.length === 0 ? (
          <p className="rounded-2xl border border-border bg-surface-2/30 px-5 py-4 text-sm text-muted">Nothing overdue and nothing short.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border text-sm">
            {attention.map((a) => (
              <li key={a.key}>
                <Link href={a.href} className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-foreground/[0.02]">
                  <CircleAlert size={14} className="shrink-0 text-red-300" />
                  <span className="min-w-0 flex-1 truncate">{a.title}</span>
                  <span className="shrink-0 text-xs text-muted">{a.note}</span>
                  <ArrowUpRight size={14} className="shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Group>

      {/* where each book will fill itself in from, once connected */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface-2/30 p-5">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Wallet size={14} className="text-muted" /> Skydo
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            Once the Skydo workflow is connected, invoices raised there arrive here with their number, amount and currency, and a payment marks its invoice paid
            on its own. Until then, raise invoices on a client&apos;s Billing tab and mark them paid there.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-surface-2/30 p-5">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Sheet size={14} className="text-muted" /> Payroll sheet
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            Once the payroll sheet is connected, each month&apos;s payments come from it: who was paid, how much and when. Until then, record a payment on a
            person&apos;s pay page under Team pay.
          </p>
        </div>
      </div>
    </div>
  );

  const clientsTab = (
    <div className="panel overflow-hidden rounded-2xl text-sm">
      <div className={`${CLIENT_ROW} py-2.5 text-xs text-muted`}>
        <span>Client</span>
        <span className="hidden md:block">Billing cycle</span>
        <span className="text-right">Outstanding</span>
        <span className="hidden text-right md:block">Paid to date</span>
        <span className="hidden md:block">Next due</span>
        <span />
      </div>
      {clients
        .map((c) => {
          const own = inr.filter((i) => i.client.id === c.id);
          return { c, l: ledger(own, today), paidToDate: own.filter((i) => i.status === "paid").reduce((n, i) => n + i.amount, 0) };
        })
        .filter(({ c, l }) => c.status === "current" || l.outstanding > 0)
        .sort((a, b) => b.l.overdue - a.l.overdue || b.l.outstanding - a.l.outstanding)
        .map(({ c, l, paidToDate }) => {
          const logo = clientLogoSrc(c);
          const rule = billingCycle(c);
          return (
            <Link key={c.id} href={`${clientHref(c)}?tab=billing`} className={`${CLIENT_ROW} group border-t border-border/50 py-3 transition-colors hover:bg-foreground/[0.02]`}>
              <span className="flex min-w-0 items-center gap-3">
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a data: URI, not an optimizable remote asset
                  <img src={logo} alt="" className="photo shrink-0" style={{ width: 26, height: 26 }} />
                ) : (
                  <Avatar name={c.name} size={26} presence={false} />
                )}
                <span className="truncate font-medium">{c.name}</span>
              </span>
              <span className={`hidden truncate md:block ${rule ? "text-muted" : "text-muted/50"}`}>{rule ?? "Not set"}</span>
              <span className={`text-right tabular-nums ${l.outstanding ? "font-medium" : "text-muted/50"}`}>{l.outstanding ? money(l.outstanding) : "–"}</span>
              <span className="hidden text-right tabular-nums text-muted md:block">{paidToDate ? money(paidToDate) : "–"}</span>
              <span className={`hidden md:block ${l.overdue ? "text-red-300" : "text-muted"}`}>{l.overdue ? `${l.overdue} overdue` : l.nextDue ? day(l.nextDue) : "–"}</span>
              <ArrowUpRight size={14} className="text-muted opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          );
        })}
    </div>
  );

  const invoicesTab =
    invoices.length === 0 ? (
      empty("No invoices yet. Raise one from a client's Billing tab; once Skydo is connected they'll arrive here on their own.")
    ) : (
      <div className="panel overflow-hidden rounded-2xl text-sm">
        <div className={`${INVOICE_ROW} py-2.5 text-xs text-muted`}>
          <span>Invoice</span>
          <span className="hidden md:block">Client</span>
          <span className="text-right">Amount</span>
          <span className="hidden md:block">Status</span>
          <span className="hidden md:block">Due</span>
          <span>Payment</span>
        </div>
        {invoices.map((i) => {
          const late = isOverdue(i, today);
          return (
            <Link key={i.id} href={`/finance/invoices/${i.id}`} className={`${INVOICE_ROW} border-t border-border/50 py-3 transition-colors hover:bg-foreground/[0.02]`}>
              <span className="min-w-0">
                <span className="block truncate font-medium">{i.number ?? `Raised ${day(i.raised)}`}</span>
                <span className="block truncate text-xs text-muted md:hidden">{i.client.name}</span>
              </span>
              <span className="hidden truncate text-muted md:block">{i.client.name}</span>
              <span className="text-right tabular-nums">{money(i.amount, i.currency)}</span>
              <span className="hidden text-muted md:block">{INVOICE_STATUS[i.status]}</span>
              <span className={`hidden md:block ${late ? "text-red-300" : "text-muted"}`}>{i.dueDate ? day(i.dueDate) : "–"}</span>
              <span className={i.status === "paid" ? "text-foreground" : late ? "text-red-300" : "text-muted"}>
                {i.status === "paid" ? `Paid ${i.paidAt ? day(i.paidAt) : ""}` : late ? "Overdue" : i.status === "draft" ? "Not sent" : "Awaiting"}
              </span>
            </Link>
          );
        })}
      </div>
    );

  const teamTab = (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">Paid from the payroll sheet, separately from client payments. Open someone to record a payment or change how they&apos;re paid.</p>
        <PayrollSheet url={sheet} />
      </div>
      <div className="panel overflow-hidden rounded-2xl text-sm">
        <div className={`${TEAM_ROW} py-2.5 text-xs text-muted`}>
          <span>Person</span>
          <span className="hidden md:block">Pay structure</span>
          <span className="text-right">Monthly salary</span>
          <span className="hidden text-right md:block">Paid, {monthLabel(month).slice(0, 3)}</span>
          <span className="hidden md:block">Paid on</span>
          <span>{monthLabel(month).slice(0, 3)}</span>
        </div>
        {team.map(({ p, dept, salary, now }) => {
          const state = salary === null && !now.paid ? null : payState(now);
          return (
            <Link key={p.id} href={`/finance/team/${p.id}`} className={`${TEAM_ROW} border-t border-border/50 py-3 transition-colors hover:bg-foreground/[0.02]`}>
              <span className="flex min-w-0 items-center gap-3">
                <Avatar name={p.name} size={26} presence={false} />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{p.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {[p.jobTitle?.name, dept].filter(Boolean).join(" · ") || "No position set"}
                    {p.employment === "on_leave" && <span> · On leave</span>}
                  </span>
                </span>
              </span>
              <span className="hidden truncate text-muted md:block">
                {[p.payStructure ? PAY_STRUCTURE[p.payStructure] : null, p.employmentType ? EMPLOYMENT_TYPE_LABEL[p.employmentType] : null].filter(Boolean).join(" · ") || "–"}
              </span>
              <span className={`text-right tabular-nums ${salary === null ? "text-muted/50" : ""}`}>{salary === null ? "Not set" : money(salary)}</span>
              <span className="hidden text-right tabular-nums text-muted md:block">{now.paid ? money(now.paid) : "–"}</span>
              <span className="hidden text-muted md:block">{now.paidAt ? day(now.paidAt) : "–"}</span>
              <span>
                {state ? (
                  <span className={`flex items-center gap-1 text-xs ${PAY_PILL[state]}`}>
                    {state === "paid" && <Check size={12} className="text-accent" />}
                    {PAY_LABEL[state]}
                  </span>
                ) : (
                  <span className="text-xs text-muted/50">–</span>
                )}
              </span>
            </Link>
          );
        })}
        <div className={`${TEAM_ROW} border-t border-border py-3 text-xs text-muted`}>
          <span>{paid.length} on the payroll</span>
          <span className="hidden md:block" />
          <span className="text-right text-sm font-medium tabular-nums text-foreground">{money(pay.obligations)}</span>
          <span className="hidden text-right text-sm tabular-nums md:block">{money(pay.paid)}</span>
          <span className="hidden md:block" />
          <span />
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Finance</h1>
        <p className="mt-1.5 text-sm text-muted">Two separate books: clients pay through Skydo, and the team is paid from the payroll sheet.</p>
      </div>
      <ClientTabs
        width=""
        initialTab={tab}
        tabs={[
          { key: "overview", label: "Overview", content: overview },
          { key: "clients", label: "Clients", content: clientsTab },
          { key: "invoices", label: "Invoices", count: invoices.length, content: invoicesTab },
          { key: "team", label: "Team pay", content: teamTab },
        ]}
      />
    </div>
  );
}
