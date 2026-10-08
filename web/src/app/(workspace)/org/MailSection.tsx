import { MailOpen, MousePointerClick, Percent, Send, Target } from "lucide-react";
import { PrefetchLink as Link } from "@/app/(workspace)/PrefetchLink";
import { dayOf } from "@/lib/editorKpi";
import { mailStats, type MailTotals } from "@/lib/mailTrack";
import { StatTile } from "../StatTile";

const RANGES = [
  { key: "today", label: "Today" },
  { key: "7", label: "7 days" },
  { key: "30", label: "30 days" },
];

// the start of the range: today from midnight in India, or so many days back
const sinceFor = (key: string) => (key === "today" ? new Date(`${dayOf(new Date())}T00:00:00+05:30`) : new Date(Date.now() - Number(key) * 86_400_000));
const pct = (part: number, of: number) => (of ? `${Math.round((part / of) * 100)}%` : "0%");
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

// Sales' email numbers, from the mail tracker (lib/mailTrack.ts): the
// totals, each alias of the sales inbox, and the latest emails
export async function MailSection({ base, range }: { base: string; range?: string }) {
  const key = RANGES.some((r) => r.key === range) ? range! : "7";
  const { total, aliases, latest } = await mailStats(sinceFor(key));

  return (
    <section className="mt-10">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Email</h2>
        <div role="tablist" className="flex rounded-full bg-white/[0.04] p-1 ring-1 ring-white/[0.07]">
          {RANGES.map((r) => (
            <Link key={r.key} role="tab" aria-selected={r.key === key} href={`${base}?mail=${r.key}`} scroll={false} className="seg rounded-full px-2.5 py-0.5 text-xs font-medium">
              {r.label}
            </Link>
          ))}
        </div>
        <Link href="/mail-tracker" className="btn btn-ghost ml-auto text-sm">
          Set up tracker
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Sent" value={total.sent} Icon={Send} />
        <StatTile label="Open rate" value={pct(total.opened, total.sent)} lit={total.opened > 0} Icon={Percent} />
        <StatTile label="Opens" value={total.opens} Icon={MailOpen} />
        <StatTile label="Click rate" value={pct(total.clicked, total.sent)} lit={total.clicked > 0} Icon={Target} />
        <StatTile label="Clicks" value={total.clicks} Icon={MousePointerClick} />
      </div>

      {aliases.length > 0 && (
        <div className="panel mt-3 overflow-x-auto rounded-2xl px-2 py-1">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="px-3 py-2.5 font-medium">Sent from</th>
                {["Sent", "Open rate", "Opens", "Click rate", "Clicks"].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-right font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {aliases.map((a: { from: string } & MailTotals) => (
                <tr key={a.from} className="border-t border-white/[0.06]">
                  <td className="max-w-[16rem] truncate px-3 py-2.5">{a.from || "Unknown"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{a.sent}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{pct(a.opened, a.sent)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{a.opens}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{pct(a.clicked, a.sent)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{a.clicks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {latest.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          {latest.map((m) => (
            <div key={m.id} className="panel-soft flex items-center gap-3 rounded-2xl px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">
                  {m.to}
                  {m.subject && <span className="text-muted"> · {m.subject}</span>}
                </p>
                <p className="truncate text-xs text-muted">
                  {m.from} · {when(m.sentAt)}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium tabular-nums ${m.opens ? "bg-emerald-400/15 text-emerald-300" : "bg-white/[0.05] text-muted"}`} title={m.lastOpenAt ? `Last opened ${when(m.lastOpenAt)}` : undefined}>
                {m.opens ? `Opened ${m.opens}×` : "Not opened"}
              </span>
              {m.clicks > 0 && <span className="shrink-0 rounded-full bg-accent/15 px-2.5 py-0.5 text-[11px] font-medium tabular-nums text-accent">Clicked {m.clicks}×</span>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
