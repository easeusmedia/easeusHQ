import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { ArrowUpRight, CircleCheck, Clock, FileSignature, PenLine, ScrollText, Send } from "lucide-react";
import { StatTile } from "../StatTile";
import { prisma } from "@/lib/prisma";
import { requireOps } from "@/lib/auth";
import { indiaDay } from "@/lib/due";
import { compose, withDefaults, type Clause } from "@/lib/contract";
import { STEPS, contractStage, stepOf } from "./status";
import { NewContract } from "./NewContract";
import { trackContracts } from "./tracking";

export const dynamic = "force-dynamic";

const ago = (d: Date) => {
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return mins <= 1 ? "just now" : `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

// Every client contract: how many sit at each stage, then each one, newest
// activity first, with how far it's got.
export default async function ContractsPage() {
  if (!(await requireOps())) redirect("/board");
  // anything out for signature: catch up on Adobe's emails — once the page
  // is on its way, so Gmail's second or two isn't spent before it; what it
  // finds arrives on the next pulse
  after(() => trackContracts().catch(() => {}));
  const today = indiaDay(new Date());
  const contracts = (await prisma.contract.findMany({ orderBy: { updatedAt: "desc" }, omit: { signedPdf: true } })).map((c) => {
    const d = withDefaults(c.details);
    const missing = compose(c.clauses as Clause[], d, today).missing.length;
    return { c, d, missing, stage: contractStage(c.status, missing) };
  });
  const count = (...statuses: string[]) => contracts.filter((x) => statuses.includes(x.c.status)).length;
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contracts</h1>
          <p className="mt-1.5 text-sm text-muted">Send a short form, shape the terms with Claude, approve, and send for e-signature.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/contracts/template" className="btn btn-ghost flex items-center gap-1.5">
            <ScrollText size={14} /> Master template
          </Link>
          <NewContract />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Waiting for client" value={count("invited")} Icon={Clock} />
        <StatTile label="Needs you" value={count("draft", "approved")} Icon={PenLine} />
        <StatTile label="Out for signature" value={count("sent")} Icon={Send} />
        <StatTile label="Signed" value={count("signed")} Icon={CircleCheck} tone="emerald" />
      </div>

      {contracts.length === 0 ? (
        <div className="flex flex-col items-center rounded-3xl border border-dashed border-white/10 px-6 py-16 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-accent/15 text-accent">
            <FileSignature size={20} />
          </span>
          <p className="mt-4 text-sm">No contracts yet</p>
          <p className="mt-1 max-w-sm text-xs text-muted">Create one with New contract. You&apos;ll get a short form link to send your client.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {contracts.map(({ c, d, stage }) => {
            const title = d.entity || c.name || d.contactName || "Untitled";
            const at = stepOf(c.status);
            const sub = [d.contactName && d.contactName !== title ? d.contactName : null, d.termMonths && `${d.termMonths} month${d.termMonths === 1 ? "" : "s"}`, d.country]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={c.id}>
                <Link
                  href={`/contracts/${c.id}`}
                  className="group flex items-center gap-4 rounded-2xl panel-soft panel-hover px-4 py-3.5 hover:-translate-y-px sm:px-5"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-sm font-semibold text-accent">
                    {title.trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{title}</span>
                    <span className="block truncate text-xs text-muted">{sub || (c.status === "invited" ? "Form sent, not filled in yet" : "Service agreement")}</span>
                  </span>
                  {/* how far along, at a glance */}
                  <span className="hidden items-center gap-1 md:flex" title={STEPS[Math.min(at, STEPS.length - 1)]}>
                    {STEPS.map((s, i) => (
                      <span key={s} className={`h-1 w-5 rounded-full ${i < at ? "bg-accent" : i === at ? "bg-accent/40" : "bg-white/10"}`} />
                    ))}
                  </span>
                  <span className="hidden w-16 text-right text-xs text-muted sm:block">{ago(c.updatedAt)}</span>
                  <span className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs ${stage.tone}`}>
                    <span className={`size-1.5 rounded-full ${stage.dot}`} />
                    {stage.label}
                  </span>
                  <ArrowUpRight size={15} className="hidden shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100 sm:block" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
