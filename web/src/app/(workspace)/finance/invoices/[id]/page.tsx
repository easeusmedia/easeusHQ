import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { indiaDay } from "@/lib/due";
import { clientHref } from "@/lib/slug";
import { isOverdue } from "@/lib/finance";
import { requireFinance } from "../../access";
import { billingCycle, day, INVOICE_STATUS, money } from "../../data";
import { InvoiceEditor } from "../../ui";

export const dynamic = "force-dynamic";

// One invoice: what it's for, where it stands, and the details Skydo will
// fill in once it's connected.
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  await requireFinance();
  const { id } = await params;
  const inv = await prisma.invoice.findUnique({ where: { id }, include: { client: true, project: { select: { id: true, name: true, type: true } } } });
  if (!inv) notFound();

  const today = indiaDay(new Date());
  const due = inv.dueDate ? indiaDay(inv.dueDate) : null;
  const paidAt = inv.paidAt ? indiaDay(inv.paidAt) : null;
  const late = isOverdue({ amount: Number(inv.amount), status: inv.status, dueDate: due, paidAt }, today);
  const facts: [string, React.ReactNode][] = [
    ["Client", <Link key="c" href={`${clientHref(inv.client)}?tab=billing`} className="hover:underline">{inv.client.name}</Link>],
    ["Billing cycle", billingCycle(inv.client) ?? "Not set"],
    ["Raised", day(indiaDay(inv.createdAt))],
    ["Due", due ? <span key="d" className={late ? "text-red-300" : ""}>{day(due)}</span> : "Not set"],
    ["Paid", paidAt ? day(paidAt) : "Not yet"],
    ["Project", inv.project ? <Link key="p" href={`/projects/${inv.project.id}`} className="hover:underline">{inv.project.name || inv.project.type}</Link> : "Not tied to one"],
    ["Came from", inv.source === "skydo" ? "Skydo" : "Raised here"],
    ["In Skydo", inv.externalUrl ? <a key="s" href={inv.externalUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:underline">Open <ArrowUpRight size={12} /></a> : "Not linked yet"],
  ];

  return (
    <div className="flex flex-col gap-6">
      <Link href="/finance?tab=invoices" className="flex w-fit items-center gap-1.5 text-xs text-muted hover:text-foreground">
        <ArrowLeft size={13} /> Invoices
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{inv.number ?? "Invoice"} · {inv.client.name}</p>
          <h1 className="mt-1 text-4xl font-semibold tabular-nums tracking-tight">{money(Number(inv.amount), inv.currency)}</h1>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-sm ${
            inv.status === "paid" ? "border-accent/30 bg-accent/10 text-accent" : late ? "border-red-400/30 bg-red-400/10 text-red-300" : "border-border bg-surface-2 text-muted"
          }`}
        >
          {late && inv.status !== "overdue" ? "Overdue" : INVOICE_STATUS[inv.status]}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
        <section className="rounded-2xl border border-border bg-surface-2/30 p-5">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
            {facts.map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="mt-0.5 truncate text-sm">{v}</dd>
              </div>
            ))}
          </dl>
          {inv.notes && <p className="mt-4 whitespace-pre-line border-t border-border pt-4 text-sm text-muted">{inv.notes}</p>}
        </section>
        <section className="rounded-2xl border border-border bg-surface-2/30 p-5">
          <InvoiceEditor id={inv.id} status={inv.status} number={inv.number ?? ""} currency={inv.currency} notes={inv.notes ?? ""} />
        </section>
      </div>
    </div>
  );
}
