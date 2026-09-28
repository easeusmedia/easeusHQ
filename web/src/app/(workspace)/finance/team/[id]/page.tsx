import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { indiaDay } from "@/lib/due";
import { displayTeam, EMPLOYMENT_TYPE_LABEL } from "@/lib/teams";
import { payState } from "@/lib/finance";
import { Avatar } from "../../../TaskCard";
import { requireFinance } from "../../access";
import { day, money, monthLabel, PAY_CYCLE, PAY_STRUCTURE, prevMonth } from "../../data";
import { DeletePayment, PayDetails, RecordPayment } from "../../ui";

export const dynamic = "force-dynamic";

const PILL = {
  paid: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  partial: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  pending: "border-border bg-surface-2 text-muted",
} as const;
const STATE = { paid: "Paid", partial: "Part paid", pending: "Pending" } as const;

// One person's pay: how they're paid, a month's payment to record, and
// every month recorded so far. Separate from client money throughout.
export default async function PersonPayPage({ params }: { params: Promise<{ id: string }> }) {
  await requireFinance();
  const { id } = await params;
  const person = await prisma.user.findUnique({
    where: { id },
    include: { team: true, jobTitle: true, salaryPayments: { orderBy: { period: "desc" } } },
  });
  if (!person) notFound();

  const today = indiaDay(new Date());
  const salary = person.salary ? Number(person.salary) : null;
  // the last twelve months, newest first, each with what's due for it
  const months: string[] = [];
  for (let m = today.slice(0, 7); months.length < 12; m = prevMonth(m)) months.push(m);
  const recorded = Object.fromEntries(
    person.salaryPayments.map((s) => [s.period, { amount: Number(s.amount), paid: Number(s.paid), paidOn: s.paidAt ? indiaDay(s.paidAt) : "", note: s.note ?? "" }])
  );
  const options = months.map((m) => ({ value: m, label: monthLabel(m), due: recorded[m]?.amount ?? salary ?? 0 }));
  const totalPaid = person.salaryPayments.reduce((n, s) => n + Number(s.paid), 0);

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <Link href="/finance?tab=team" className="flex w-fit items-center gap-1.5 text-xs text-muted hover:text-foreground">
        <ArrowLeft size={13} /> Team pay
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={person.name} size={52} presence={false} />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{person.name}</h1>
            <p className="mt-0.5 text-sm text-muted">
              {[person.jobTitle?.name, displayTeam(person)?.name, person.employmentType ? EMPLOYMENT_TYPE_LABEL[person.employmentType] : null].filter(Boolean).join(" · ") ||
                "No position set"}
            </p>
          </div>
        </div>
        <Link href={`/team?person=${person.id}`} className="flex items-center gap-1 text-xs text-muted hover:text-foreground">
          Their profile <ArrowUpRight size={12} />
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Monthly salary", salary === null ? "Not set" : money(salary)],
          ["How they're paid", [person.payStructure ? PAY_STRUCTURE[person.payStructure] : null, person.payCycle ? PAY_CYCLE[person.payCycle] : null].filter(Boolean).join(", ") || "Not set"],
          ["Paid in total", money(totalPaid)],
        ].map(([k, v]) => (
          <div key={k} className="panel rounded-2xl px-5 py-4">
            <p className="text-xl font-semibold tabular-nums">{v}</p>
            <p className="mt-1 text-xs text-muted">{k}</p>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-border bg-surface-2/30 p-5">
        <h2 className="mb-4 text-sm font-semibold">Record a payment</h2>
        <RecordPayment userId={person.id} months={options} today={today} existing={recorded} />
      </section>

      <section className="rounded-2xl border border-border bg-surface-2/30 p-5">
        <h2 className="mb-4 text-sm font-semibold">Payment history</h2>
        {person.salaryPayments.length === 0 ? (
          <p className="text-sm text-muted">Nothing recorded yet. Once the payroll sheet is connected, each month fills in from it.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border text-sm">
            {person.salaryPayments.map((s) => {
              const state = payState({ due: Number(s.amount), paid: Number(s.paid) });
              return (
                <li key={s.id} className="group flex items-center gap-4 bg-surface/40 px-4 py-2.5">
                  <span className="w-20 shrink-0 font-medium">{monthLabel(s.period)}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted">{s.note ?? (s.source === "sheet" ? "From the payroll sheet" : "")}</span>
                  <span className="shrink-0 tabular-nums">{money(Number(s.paid))}</span>
                  <span className="hidden w-24 shrink-0 text-right text-xs text-muted sm:block">of {money(Number(s.amount))}</span>
                  <span className="hidden w-16 shrink-0 text-xs text-muted sm:block">{s.paidAt ? day(indiaDay(s.paidAt)) : "–"}</span>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${PILL[state]}`}>{STATE[state]}</span>
                  <DeletePayment id={s.id} month={monthLabel(s.period)} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-surface-2/30 p-5">
        <h2 className="mb-4 text-sm font-semibold">How they&apos;re paid</h2>
        <PayDetails userId={person.id} salary={salary === null ? "" : String(salary)} payStructure={person.payStructure ?? ""} payCycle={person.payCycle ?? ""} />
      </section>
    </div>
  );
}
