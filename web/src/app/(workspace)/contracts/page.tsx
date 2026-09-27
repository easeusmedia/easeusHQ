import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText, ScrollText } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOps } from "@/lib/auth";
import { indiaDay } from "@/lib/due";
import { compose, withDefaults, type Clause } from "@/lib/contract";
import { contractStage } from "./status";
import { NewContract } from "./NewContract";

export const dynamic = "force-dynamic";

// Every client contract, newest first: the link that's out, the ones waiting
// on us, the ones out for signature, the signed.
export default async function ContractsPage() {
  if (!(await requireOps())) redirect("/board");
  const contracts = await prisma.contract.findMany({ orderBy: { updatedAt: "desc" } });
  const today = indiaDay(new Date());

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Contracts</h1>
          <p className="mt-1 text-sm text-muted">Send a new client the form, add the terms, review, and send it for signing.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/contracts/template" className="btn btn-ghost flex items-center gap-1.5">
            <ScrollText size={14} /> Master template
          </Link>
          <NewContract />
        </div>
      </div>

      {contracts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
          <FileText size={22} className="mx-auto text-muted" />
          <p className="mt-3 text-sm">No contracts yet</p>
          <p className="mt-1 text-xs text-muted">Start one with New contract — you&apos;ll get a link to send the client.</p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-2xl border border-border bg-surface/40">
          {contracts.map((c) => {
            const d = withDefaults(c.details);
            const { missing } = compose(c.clauses as Clause[], d, today);
            const stage = contractStage(c.status, missing.length);
            const title = d.entity || c.name || d.contactName || "Untitled";
            const sub = [d.tradingName && `t/a ${d.tradingName}`, d.termMonths && `${d.termMonths} month${d.termMonths === 1 ? "" : "s"}`, d.country]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={c.id}>
                <Link href={`/contracts/${c.id}`} className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-2/60">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{title}</span>
                    <span className="block truncate text-xs text-muted">{sub || (c.status === "invited" ? "Form sent — not filled in yet" : "—")}</span>
                  </span>
                  <span className="hidden text-xs text-muted sm:block">
                    {c.updatedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </span>
                  <span className={`shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${stage.tone}`}>{stage.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
