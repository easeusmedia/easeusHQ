import { MailOpen, Percent, Reply, Send, Target } from "lucide-react";
import { PrefetchLink as Link } from "@/app/(workspace)/PrefetchLink";
import { dayOf } from "@/lib/editorKpi";
import { salesSummary } from "@/lib/mailReport";
import { StatTile } from "../StatTile";

const RANGES = [
  { key: "today", label: "Today" },
  { key: "7", label: "7 days" },
  { key: "30", label: "30 days" },
];

// the start of the range: today from midnight in India, or so many days back
const sinceFor = (key: string) => (key === "today" ? new Date(`${dayOf(new Date())}T00:00:00+05:30`) : new Date(Date.now() - Number(key) * 86_400_000));
const pct = (part: number, of: number) => (of ? `${Math.round((part / of) * 100)}%` : "–");

// Sales' email numbers: what was sent and the replies, from the sales inbox
// (every email, whichever computer sent it), and the open and click rates
// of the emails the tracker saw (lib/mailReport.ts); overall and per alias
export async function MailSection({ base, range }: { base: string; range?: string }) {
  const key = RANGES.some((r) => r.key === range) ? range! : "7";
  const s = await salesSummary(sinceFor(key));
  const trackedNote = (n: number) => <p className="text-xs text-muted">{s.inboxOn ? `${n} of ${s.sent} emails tracked` : `${n} tracked`}</p>;

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
        <Link href="/email" className="btn btn-ghost ml-auto text-sm">
          Open
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Sent" value={s.sent} Icon={Send} />
        <StatTile label="Replies" value={s.replies.replies} tone="emerald" Icon={Reply} />
        <StatTile label="Reply rate" value={pct(s.replies.answered, s.replies.started)} lit={s.replies.answered > 0} tone="emerald" Icon={Percent} note={<p className="text-xs text-muted">{s.replies.answered} of {s.replies.started} conversations</p>} />
        <StatTile label="Open rate" value={pct(s.tracked.opened, s.tracked.sent)} lit={s.tracked.opened > 0} Icon={MailOpen} note={trackedNote(s.tracked.sent)} />
        <StatTile label="Click rate" value={pct(s.tracked.clicked, s.tracked.withLinks)} lit={s.tracked.clicked > 0} Icon={Target} note={trackedNote(s.tracked.withLinks)} />
      </div>

      {s.aliases.length > 0 && (
        <div className="panel mt-3 overflow-x-auto rounded-2xl px-2 py-1">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="px-3 py-2.5 font-medium">Sent from</th>
                {["Sent", "Replies", "Reply rate", "Open rate", "Click rate"].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-right font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.aliases.map((a) => (
                <tr key={a.from} className="border-t border-white/[0.06]">
                  <td className="max-w-[16rem] truncate px-3 py-2.5">{a.from}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{a.sent || a.tracked.sent}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{a.replies.replies}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{pct(a.replies.answered, a.replies.started)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{pct(a.tracked.opened, a.tracked.sent)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{pct(a.tracked.clicked, a.tracked.withLinks)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
