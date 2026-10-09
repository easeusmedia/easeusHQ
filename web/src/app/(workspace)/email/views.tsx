import { AlertTriangle, CornerUpLeft, FileText, Inbox, MailOpen, MousePointerClick, Send, Timer, Users } from "lucide-react";
import { PrefetchLink as Link } from "@/app/(workspace)/PrefetchLink";
import { StatTile } from "../StatTile";
import { Bars, Change, Heatmap, Ring, Trend, pct } from "./charts";
import { CopyLink, DeletePdf } from "./controls";
import { EMAIL_FILTERS, RANGES, WAIT_BUCKETS, type Activity, type EmailFilter, type EmailRow, type LinkRow, type Performance, type Range } from "@/lib/mailReport";
import type { DocRow } from "@/lib/docTrack";

// The Email pages' views (page.tsx picks one): Mailsuite's dashboard, rebuilt

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
export function ago(iso: string, now: number) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  return day(iso);
}
export function duration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86_400)} day${seconds >= 172_800 ? "s" : ""} ${Math.round((seconds % 86_400) / 3600)} hours`;
}
const host = (url: string) => {
  try {
    const u = new URL(url);
    return u.host + (u.pathname === "/" ? "" : u.pathname);
  } catch {
    return url;
  }
};

function Panel({ title, aside, children, className = "" }: { title?: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`panel rounded-2xl p-5 ${className}`}>
      {(title || aside) && (
        <div className="mb-4 flex items-center gap-3">
          {title && <h2 className="text-sm font-medium">{title}</h2>}
          {aside && <div className="ml-auto flex items-center gap-2">{aside}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

// ---------- latest activity ----------

const ACTIVITY = {
  open: { Icon: MailOpen, tone: "bg-emerald-400/15 text-emerald-300" },
  click: { Icon: MousePointerClick, tone: "bg-accent/15 text-accent" },
  reply: { Icon: CornerUpLeft, tone: "bg-violet-400/15 text-violet-300" },
  bounce: { Icon: AlertTriangle, tone: "bg-rose-400/15 text-rose-300" },
  pdf: { Icon: FileText, tone: "bg-amber-400/15 text-amber-300" },
};

export function ActivityList({ items, now }: { items: Activity[]; now: number }) {
  if (!items.length) return <p className="py-6 text-center text-sm text-muted">No activity yet</p>;
  return (
    <div className="flex flex-col">
      {items.map((a, i) => {
        const { Icon, tone } = ACTIVITY[a.kind];
        const subject = <span className="text-accent">&ldquo;{a.subject || "No subject"}&rdquo;</span>;
        const who = a.to || "Someone";
        return (
          <div key={`${a.kind}-${a.at}-${i}`} className="flex items-center gap-3 border-b border-white/[0.05] py-2.5 last:border-0">
            <span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${tone}`}>
              <Icon size={14} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">
                <span className="font-medium">{who}</span>{" "}
                {a.kind === "open" && <>opened your email {subject}</>}
                {a.kind === "click" && (
                  <>
                    clicked {a.url ? <span className="text-muted">{host(a.url)}</span> : "a link"} in {subject}
                  </>
                )}
                {a.kind === "reply" && <>replied to {subject}</>}
                {a.kind === "bounce" && <>bounced {subject}</>}
                {a.kind === "pdf" && (
                  <>
                    read {subject}
                    {a.seconds ? <span className="text-muted"> for {duration(a.seconds)}</span> : null}
                  </>
                )}
              </p>
              <p className="text-xs text-muted">
                {ago(a.at, now)}
                {a.nth > 1 && (a.kind === "open" || a.kind === "click" || a.kind === "pdf") && ` · ${ordinal(a.nth)} time`}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- home: the latest, and yesterday's report ----------

export function HomeView({ items, report, now }: { items: Activity[]; report: Performance; now: number }) {
  const sent = report.inbox.sent || report.now.sent;
  const inboxOn = report.inbox.sent > 0 || report.inbox.received > 0;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <Panel title="Latest activity" aside={<Link href="/email?tab=activity" className="text-xs text-muted hover:text-foreground">See all</Link>}>
        <ActivityList items={items} now={now} />
      </Panel>
      <Panel title={`Daily report · ${day(report.start)}`} aside={<Link href="/email?tab=performance&range=day" className="text-xs text-muted hover:text-foreground">Full report</Link>}>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Sent emails", value: sent, Icon: Send },
            { label: "Recipients", value: report.inbox.recipients, Icon: Users },
            { label: "Received emails", value: report.inbox.received, Icon: Inbox },
            { label: "Replies", value: inboxOn ? report.replies.now.replies : report.now.replied, Icon: CornerUpLeft },
          ].map((t) => (
            <div key={t.label} className="rounded-xl bg-white/[0.03] px-3 py-2.5 ring-1 ring-white/[0.06]">
              <p className="flex items-center gap-1.5 text-[11px] text-muted">
                <t.Icon size={12} /> {t.label}
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{t.value}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-center">
          <div className="flex flex-col items-center gap-1">
            <Ring part={report.now.opened} of={report.now.sent} size={110} />
            <span className="text-xs text-muted">Opening rate</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <Ring part={report.now.clicked} of={report.now.withLinks} tone="emerald" size={110} />
            <span className="text-xs text-muted">Link click rate</span>
          </div>
        </div>
        {/* opens and clicks come only from emails sent with the tracker */}
        {inboxOn && <p className="mt-3 text-center text-xs text-muted">{report.now.sent} of {sent} emails tracked</p>}
      </Panel>
    </div>
  );
}

// ---------- every tracked email ----------

export function EmailsView({ rows, filter, more, query }: { rows: EmailRow[]; filter: EmailFilter; more: string | null; query: (p: Record<string, string>) => string }) {
  return (
    <Panel
      aside={
        <>
          <div role="tablist" className="flex flex-wrap rounded-full bg-white/[0.04] p-1 ring-1 ring-white/[0.07]">
            {(Object.keys(EMAIL_FILTERS) as EmailFilter[]).map((f) => (
              <Link key={f} role="tab" aria-selected={f === filter} href={query({ tab: "emails", filter: f })} scroll={false} className="seg rounded-full px-2.5 py-0.5 text-xs font-medium">
                {EMAIL_FILTERS[f].label}
              </Link>
            ))}
          </div>
          <a href={`/email/export${query({ tab: "emails", filter })}`} className="btn btn-xs btn-ghost">
            Download CSV
          </a>
        </>
      }
    >
      {!rows.length ? (
        <p className="py-6 text-center text-sm text-muted">No emails here yet</p>
      ) : (
        <div className="flex flex-col">
          {rows.map((m) => (
            <div key={m.id} className="grid gap-x-4 gap-y-1 border-b border-white/[0.05] py-3 last:border-0 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_minmax(0,13rem)]">
              <div className="flex min-w-0 flex-wrap gap-1">
                {[m.to, ...(m.others ? m.others.split(", ") : [])].slice(0, 3).map((r) => (
                  <span key={r} className="max-w-full truncate rounded-full bg-white/[0.05] px-2 py-0.5 text-xs">
                    {r}
                  </span>
                ))}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm">{m.subject || "No subject"}</p>
                <p className="truncate text-xs text-muted">
                  Sent {when(m.sentAt)} · {m.from}
                </p>
              </div>
              <div className="min-w-0 md:text-right">
                <div className="flex flex-wrap gap-1.5 md:justify-end">
                  {m.bouncedAt ? (
                    <span className="rounded-full bg-rose-400/15 px-2 py-0.5 text-[11px] font-medium text-rose-300">Bounced</span>
                  ) : (
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ${m.opens ? "bg-emerald-400/15 text-emerald-300" : "bg-white/[0.05] text-muted"}`}>
                      {m.opens ? `${m.opens} open${m.opens === 1 ? "" : "s"}` : "Not opened"}
                    </span>
                  )}
                  {m.clicks > 0 && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium tabular-nums text-accent">{m.clicks} click{m.clicks === 1 ? "" : "s"}</span>}
                  {m.repliedAt && <span className="rounded-full bg-violet-400/15 px-2 py-0.5 text-[11px] font-medium text-violet-300">Replied</span>}
                </div>
                {m.lastOpenAt && <p className="mt-0.5 text-[11px] text-muted">Last open {when(m.lastOpenAt)}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
      {more && (
        <div className="mt-3 text-center">
          <Link href={more} scroll={false} className="btn btn-sm btn-ghost">
            Show more
          </Link>
        </div>
      )}
    </Panel>
  );
}

// ---------- link clicks ----------

export function LinksView({ rows, csv }: { rows: LinkRow[]; csv: string }) {
  return (
    <Panel
      aside={
        <a href={csv} className="btn btn-xs btn-ghost">
          Download CSV
        </a>
      }
    >
      {!rows.length ? (
        <p className="py-6 text-center text-sm text-muted">No clicks yet</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-2 pr-3 font-medium">Recipient</th>
                <th className="py-2 pr-3 font-medium">Link</th>
                <th className="py-2 pr-3 font-medium">Last clicked</th>
                <th className="py-2 text-right font-medium">Total clicks</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.to}-${r.url}`} className="border-t border-white/[0.06]">
                  <td className="max-w-[14rem] truncate py-2.5 pr-3">{r.to}</td>
                  <td className="max-w-[20rem] truncate py-2.5 pr-3">
                    <a href={r.url} target="_blank" rel="noreferrer" className="text-muted hover:text-foreground">
                      {host(r.url)}
                    </a>
                  </td>
                  <td className="py-2.5 pr-3 text-muted">{when(r.lastAt)}</td>
                  <td className="py-2.5 text-right tabular-nums">{r.clicks === 1 ? "Clicked once" : `Clicked ${r.clicks} times`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

// ---------- tracked PDFs ----------

export function PdfsView({ docs, origin, upload }: { docs: DocRow[]; origin: string; upload: React.ReactNode }) {
  return (
    <Panel aside={upload}>
      {!docs.length ? (
        <p className="py-6 text-center text-sm text-muted">No PDFs yet</p>
      ) : (
        <div className="flex flex-col">
          {docs.map((d) => (
            <div key={d.id} className="grid items-center gap-x-4 gap-y-2 border-b border-white/[0.05] py-3 last:border-0 md:grid-cols-[minmax(0,1fr)_auto_auto]">
              <Link href={`/email?tab=pdfs&doc=${d.id}`} className="flex min-w-0 items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-400/15 text-amber-300">
                  <FileText size={16} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm">{d.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {d.pages ? `${d.pages} pages · ` : ""}Added {day(d.createdAt)}
                    {d.lastAt ? ` · Last read ${when(d.lastAt)}` : ""}
                  </span>
                </span>
              </Link>
              <div className="flex gap-4 text-right text-xs text-muted tabular-nums">
                <span>
                  <span className="block text-sm text-foreground">{d.sends ? `${pct(d.viewedSends, d.sends)}%` : "–"}</span>viewed
                </span>
                <span>
                  <span className="block text-sm text-foreground">{d.views}</span>reads
                </span>
                <span>
                  <span className="block text-sm text-foreground">{d.seconds ? duration(d.seconds) : "–"}</span>time spent
                </span>
                <span>
                  <span className="block text-sm text-foreground">{d.downloads}</span>downloads
                </span>
              </div>
              <CopyLink url={`${origin}/d/${d.id}`} />
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

type DocDetail = {
  id: string;
  name: string;
  pages: number;
  createdAt: string;
  pageSeconds: { page: number; seconds: number }[];
  views: { id: string; to: string | null; startedAt: string; seconds: number; visited: number; downloaded: boolean }[];
};

export function PdfDetail({ doc, origin }: { doc: DocDetail; origin: string }) {
  const pages = Math.max(doc.pages, ...doc.pageSeconds.map((p) => p.page), 1);
  const seconds = Array.from({ length: pages }, (_, i) => doc.pageSeconds.find((p) => p.page === i + 1)?.seconds ?? 0);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/email?tab=pdfs" className="text-sm text-muted hover:text-foreground">
          PDFs
        </Link>
        <span className="text-muted">/</span>
        <h2 className="min-w-0 truncate text-sm font-medium">{doc.name}</h2>
        <div className="ml-auto flex items-center gap-1">
          <CopyLink url={`${origin}/d/${doc.id}`} />
          <DeletePdf id={doc.id} name={doc.name} />
        </div>
      </div>
      <Panel title="Time on each page">
        <Bars labels={seconds.map((_, i) => String(i + 1))} values={seconds} unit="seconds" />
      </Panel>
      <Panel title="Readings">
        {!doc.views.length ? (
          <p className="py-6 text-center text-sm text-muted">Not read yet</p>
        ) : (
          <div className="flex flex-col">
            {doc.views.map((v) => (
              <div key={v.id} className="flex items-center gap-3 border-b border-white/[0.05] py-2.5 text-sm last:border-0">
                <span className="min-w-0 flex-1 truncate">{v.to ?? "Opened from the link"}</span>
                <span className="text-xs text-muted">{when(v.startedAt)}</span>
                <span className="w-20 text-right tabular-nums">{duration(v.seconds)}</span>
                <span className="w-24 text-right text-xs text-muted tabular-nums">
                  {pct(v.visited, pages)}% · {v.visited}/{pages}
                </span>
                <span className="w-20 text-right text-xs text-muted">{v.downloaded ? "Downloaded" : ""}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

// ---------- my performance ----------

export function PerformanceView({
  p,
  range,
  by,
  query,
  inboxOn,
  connectHref,
}: {
  p: Performance;
  range: Range;
  by: "email" | "domain";
  query: (q: Record<string, string>) => string;
  inboxOn: boolean;
  connectHref: string | null;
}) {
  const sent = inboxOn ? p.inbox.sent : p.now.sent;
  const sentBefore = inboxOn ? p.inboxBefore.sent : p.before.sent;
  const label = (d: string) => (p.unit === "month" ? new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { month: "short" }) : day(`${d}T00:00:00+05:30`));
  const series = slots(p).map((d) => p.byDay.find((x) => x.d === d) ?? { d, sent: 0, received: 0, tracked: 0 });
  const top = by === "domain" ? domains(p.top) : p.top.slice(0, 15);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" className="flex rounded-full bg-white/[0.04] p-1 ring-1 ring-white/[0.07]">
          {(Object.keys(RANGES) as Range[]).map((r) => (
            <Link key={r} role="tab" aria-selected={r === range} href={query({ tab: "performance", range: r })} scroll={false} className="seg rounded-full px-2.5 py-0.5 text-xs font-medium">
              {RANGES[r].label}
            </Link>
          ))}
        </div>
        <span className="text-xs text-muted">
          {day(p.start)} to {day(new Date(new Date(p.end).getTime() - 1).toISOString())}
        </span>
        {!inboxOn && connectHref && (
          <Link href={connectHref} className="btn btn-xs btn-ghost ml-auto">
            Connect the sales inbox
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Sent emails" value={sent} Icon={Send} note={<Change now={sent} before={sentBefore} />} />
        <StatTile label="Recipients" value={p.inbox.recipients} Icon={Users} note={<Change now={p.inbox.recipients} before={p.inboxBefore.recipients} />} />
        <StatTile label="Received emails" value={p.inbox.received} Icon={Inbox} tone="emerald" note={<Change now={p.inbox.received} before={p.inboxBefore.received} />} />
        <StatTile label="Senders" value={p.inbox.senders} Icon={Users} tone="emerald" note={<Change now={p.inbox.senders} before={p.inboxBefore.senders} />} />
        <StatTile label="Your average response time" value={p.avgResponseSeconds ? duration(Math.round(p.avgResponseSeconds)) : "–"} lit={!!p.avgResponseSeconds} Icon={Timer} />
      </div>

      <Panel title="When you send your emails">
        <Heatmap cells={p.heat} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title={p.unit === "month" ? "Emails sent by month" : "Emails sent by day"}>
          <Trend points={series.map((d) => ({ label: label(d.d), value: inboxOn ? d.sent : d.tracked }))} />
        </Panel>
        <Panel title="Time until first open">
          <Bars labels={WAIT_BUCKETS} values={p.firstOpen} />
        </Panel>
        <Panel title={p.unit === "month" ? "Emails received by month" : "Emails received by day"}>
          <Trend points={series.map((d) => ({ label: label(d.d), value: d.received }))} tone="emerald" />
        </Panel>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { title: "Opening rate", part: p.now.opened, of: p.now.sent, prev: pct(p.before.opened, p.before.sent), note: "Emails sent/opened" },
          { title: "Link click rate", part: p.now.clicked, of: p.now.withLinks, prev: pct(p.before.clicked, p.before.withLinks), note: "Links sent/clicked", tone: "emerald" as const },
          { title: "PDF viewed rate", part: p.now.docsViewed, of: p.now.docsSent, prev: pct(p.before.docsViewed, p.before.docsSent), note: "PDFs sent/viewed" },
          inboxOn
            ? { title: "Reply rate", part: p.replies.now.answered, of: p.replies.now.started, prev: pct(p.replies.before.answered, p.replies.before.started), note: "Conversations started/answered", tone: "emerald" as const }
            : { title: "Reply rate", part: p.now.replied, of: p.now.sent, prev: pct(p.before.replied, p.before.sent), note: "Emails sent/replied", tone: "emerald" as const },
        ].map((r) => (
          <Panel key={r.title} title={r.title} className="flex flex-col items-center text-center">
            <Ring part={r.part} of={r.of} tone={r.tone} />
            <div className="mt-2">
              <Change now={pct(r.part, r.of)} before={r.prev} />
            </div>
            <p className="mt-2 text-[11px] text-muted">{r.note}, against the period before</p>
          </Panel>
        ))}
      </div>

      {/* opens, clicks and PDF views come only from emails sent with the tracker */}
      {inboxOn && <p className="-mt-2 text-xs text-muted">Opening, link click and PDF rates: {p.now.sent} of {sent} emails tracked</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Time taken to respond">
          <Bars labels={WAIT_BUCKETS} values={p.respond} unit="replies" />
        </Panel>
        <Panel title="Time taken for first response">
          <Bars labels={WAIT_BUCKETS} values={p.firstResponse} unit="replies" />
        </Panel>
      </div>

      <Panel
        title="Top interactions"
        aside={
          <div role="tablist" className="flex rounded-full bg-white/[0.04] p-1 ring-1 ring-white/[0.07]">
            {(["email", "domain"] as const).map((b) => (
              <Link key={b} role="tab" aria-selected={b === by} href={query({ tab: "performance", range, by: b })} scroll={false} className="seg rounded-full px-2.5 py-0.5 text-xs font-medium capitalize">
                {b}
              </Link>
            ))}
          </div>
        }
      >
        {!top.length ? (
          <p className="py-6 text-center text-sm text-muted">No emails yet</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-2 pr-3 font-medium capitalize">{by}</th>
                <th className="py-2 pr-3 text-right font-medium">Sent</th>
                <th className="py-2 pr-3 text-right font-medium">Received</th>
                <th className="py-2 text-right font-medium">Opens</th>
              </tr>
            </thead>
            <tbody>
              {top.map((t) => (
                <tr key={t.who} className="border-t border-white/[0.06]">
                  <td className="max-w-[18rem] truncate py-2 pr-3">{t.who}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{t.sent}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{t.received}</td>
                  <td className="py-2 text-right tabular-nums">{t.opens}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

// each day (or month, over a year) of the period, as India's dates
function slots(p: Performance): string[] {
  const out: string[] = [];
  const istDay = (t: number) => new Date(t + 5.5 * 3_600_000).toISOString().slice(0, 10);
  const end = new Date(p.end).getTime() - 1;
  for (let t = new Date(p.start).getTime(); t <= end; t += 86_400_000) {
    const d = istDay(t);
    const key = p.unit === "month" ? `${d.slice(0, 7)}-01` : d;
    if (out[out.length - 1] !== key) out.push(key);
  }
  return out;
}

function domains(rows: Performance["top"]) {
  const by = new Map<string, { who: string; sent: number; received: number; opens: number }>();
  for (const r of rows) {
    const d = r.who.split("@")[1] ?? r.who;
    const t = by.get(d) ?? { who: d, sent: 0, received: 0, opens: 0 };
    t.sent += r.sent;
    t.received += r.received;
    t.opens += r.opens;
    by.set(d, t);
  }
  return [...by.values()].sort((a, b) => b.sent + b.received - (a.sent + a.received)).slice(0, 15);
}
