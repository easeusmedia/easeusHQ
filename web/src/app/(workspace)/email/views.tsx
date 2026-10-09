import { AlertTriangle, ChevronRight, Clock, CornerUpLeft, Download, ExternalLink, Eye, FileText, Inbox, MailOpen, MousePointerClick, Send, Star, User, type LucideIcon } from "lucide-react";
import { PrefetchLink as Link } from "@/app/(workspace)/PrefetchLink";
import { StatTile } from "../StatTile";
import { Info } from "../Info";
import { Bars, Change, Compare, HeatLegend, Heatmap, Ring, Trend, pct } from "./charts";
import { CopyLink, DeletePdf, FilterPicker } from "./controls";
import { ACTIVITY_TABS, EMAIL_FILTERS, RANGES, WAIT_BUCKETS, type Activity, type ActivityTab, type EmailFilter, type EmailRow, type LinkRow, type MailDetail, type MailStep, type Performance, type Range } from "@/lib/mailReport";
import type { DocRow } from "@/lib/docTrack";

// The Email pages' views (page.tsx picks one): Mailsuite's dashboard,
// rebuilt section by section, with what each number means a hover away

type Query = (p: Record<string, string>) => string;

// what each number means, in Mailsuite's words, made ours: only emails to
// and from the leads on the boards count
const HELP = {
  sent: "Emails sent to your leads in this period.",
  recipients: "Leads you emailed in this period, each counted once.",
  received: "Emails your leads sent you in this period.",
  senders: "Leads who emailed you in this period, each counted once.",
  response: "How long, on average, you take to answer an email from a lead.",
  sendHeat: "Emails sent in each hour of the week. The darker the square, the more emails.",
  receiveHeat: "Emails received in each hour of the week. The darker the square, the more emails.",
  sentByDay: "How many emails you sent each day of this period.",
  firstOpen: "How long your emails took to be opened for the first time.",
  receivedByDay: "How many emails you received each day of this period.",
  opening: "Of the emails sent with the mail tracker, how many were opened.",
  clicks: "Of the emails sent with a tracked link, how many had a link clicked.",
  pdfs: "Of the emails sent with a tracked PDF, how many had the PDF read.",
  respond: "How long you took to answer each email a lead sent you.",
  firstResponse: "How long you took to send your first answer in a conversation a lead started.",
  top: "The leads you emailed and heard from most in this period.",
  pdfViewed: "Of the emails this PDF was sent in, how many had it read.",
  pdfTime: "Time spent reading it, over every reading.",
  pdfPages: "Seconds spent on each page, over every reading.",
};

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
const istDate = (iso: string) => new Date(new Date(iso).getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
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

// a section's name, its icon and what it means
function Title({ text, help, Icon }: { text: string; help?: string; Icon?: LucideIcon }) {
  return (
    <h2 className="flex items-center gap-1.5 text-sm font-medium">
      {Icon && <Icon size={14} className="shrink-0 text-muted" />}
      {text}
      {help && <Info label={text} text={help} />}
    </h2>
  );
}

function Panel({ title, aside, footer, children, className = "" }: { title?: React.ReactNode; aside?: React.ReactNode; footer?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`panel rounded-2xl p-5 ${className}`}>
      {(title || aside) && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {title}
          {aside && <div className="ml-auto flex items-center gap-2">{aside}</div>}
        </div>
      )}
      {children}
      {footer && <div className="mt-4">{footer}</div>}
    </section>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <p className="py-8 text-center text-sm text-muted">{children}</p>;

// one number of the report: its name, what it means, and the change on the period before
function Count({ label, help, value, before, against, Icon }: { label: string; help: string; value: number; before?: number; against?: string; Icon: LucideIcon }) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-2 text-center">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
        <Icon size={13} className="shrink-0" />
        {label}
        <Info label={label} text={help} />
      </p>
      <p className="text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      {before !== undefined && <Change now={value} before={before} against={against} />}
    </div>
  );
}

// ---------- latest activity ----------

const ACTIVITY: Record<Activity["kind"], { Icon: LucideIcon; tone: string }> = {
  open: { Icon: Eye, tone: "bg-emerald-400/15 text-emerald-300" },
  click: { Icon: MousePointerClick, tone: "bg-accent/15 text-accent" },
  reply: { Icon: CornerUpLeft, tone: "bg-violet-400/15 text-violet-300" },
  bounce: { Icon: AlertTriangle, tone: "bg-rose-400/15 text-rose-300" },
  pdf: { Icon: FileText, tone: "bg-amber-400/15 text-amber-300" },
  insight: { Icon: MailOpen, tone: "bg-white/[0.06] text-muted" },
};

// Each thing that happened, newest first, as two lines: who did what, then
// the email it was about. A row opens its email.
export function ActivityList({ items, now, query }: { items: Activity[]; now: number; query: Query }) {
  if (!items.length) return <Empty>No activity yet</Empty>;
  return (
    <div className="flex flex-col">
      {items.map((a, i) => {
        const { Icon, tone } = ACTIVITY[a.kind];
        const who = <span className="font-medium text-foreground">{a.to || "Someone"}</span>;
        const again = a.nth > 1 ? ` (${ordinal(a.nth)} time)` : "";
        const line = {
          open: (
            <>
              {who} opened your email{again}
            </>
          ),
          click: (
            <>
              {who} clicked {a.url ? <span className="text-accent">{host(a.url)}</span> : "a link"}
              {again}
            </>
          ),
          reply: <>{who} replied to your email</>,
          bounce: <>Your email to {who} bounced</>,
          pdf: (
            <>
              {who} read your PDF{a.seconds ? ` for ${duration(a.seconds)}` : ""}
              {again}
            </>
          ),
          insight: <>Your email to {who} hasn&apos;t been opened yet</>,
        }[a.kind];
        const row = (
          <>
            <span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${tone}`}>
              <Icon size={14} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-muted">{line}</span>
              <span className="block truncate text-xs text-muted/80">{a.subject || "No subject"}</span>
            </span>
            <span className="shrink-0 text-xs text-muted tabular-nums">{ago(a.at, now)}</span>
          </>
        );
        const cls = "-mx-2 flex items-center gap-3 rounded-xl border-b border-white/[0.05] px-2 py-2.5 last:border-0";
        return a.mailId ? (
          <Link key={`${a.kind}-${a.at}-${i}`} href={query({ tab: "emails", mail: a.mailId })} className={`${cls} transition-colors hover:bg-white/[0.03]`}>
            {row}
          </Link>
        ) : (
          <div key={`${a.kind}-${a.at}-${i}`} className={cls}>
            {row}
          </div>
        );
      })}
    </div>
  );
}

export function ActivityView({ items, tab, now, query, older }: { items: Activity[]; tab: ActivityTab; now: number; query: Query; older: string | null }) {
  return (
    <Panel
      title={
        <nav role="tablist" className="flex flex-wrap rounded-full bg-white/[0.04] p-1 ring-1 ring-white/[0.07]">
          {(Object.keys(ACTIVITY_TABS) as ActivityTab[]).map((t) => (
            <Link key={t} role="tab" aria-selected={t === tab} href={query({ tab: "activity", show: t })} scroll={false} className="seg rounded-full px-3 py-0.5 text-xs font-medium">
              {ACTIVITY_TABS[t]}
            </Link>
          ))}
        </nav>
      }
      aside={tab === "insights" ? <Info label="Insights" text="Emails sent with the mail tracker that haven't been opened yet." /> : undefined}
      footer={
        older && (
          <div className="text-center">
            <Link href={older} className="btn btn-sm btn-ghost">
              Show older
            </Link>
          </div>
        )
      }
    >
      <ActivityList items={items} now={now} query={query} />
    </Panel>
  );
}

// ---------- home: the latest, and yesterday's report ----------

export function HomeView({ items, report, now, query }: { items: Activity[]; report: Performance; now: number; query: Query }) {
  const sent = report.inbox.sent || report.now.sent;
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <Panel
        title={<Title text="Latest activity" />}
        footer={
          <Link href={query({ tab: "activity" })} className="btn btn-sm btn-ghost">
            View all activity
          </Link>
        }
      >
        <ActivityList items={items} now={now} query={query} />
      </Panel>
      <Panel
        title={<Title text="Performance" />}
        footer={
          <Link href={query({ tab: "performance", range: "day" })} className="btn btn-sm btn-ghost">
            View full report
          </Link>
        }
      >
        <div className="grid grid-cols-2 gap-3 rounded-xl bg-white/[0.03] p-4 text-center ring-1 ring-white/[0.06]">
          <div>
            <p className="text-xs text-muted">Daily report</p>
            <p className="mt-1 text-lg font-semibold">{report.label}</p>
          </div>
          <div>
            <p className="flex items-center justify-center gap-1 text-xs text-muted">
              <Clock size={12} /> Response time <Info label="Average response time" text={HELP.response} />
            </p>
            <p className="mt-1 text-lg font-semibold">{report.avgResponseSeconds ? duration(Math.round(report.avgResponseSeconds)) : "–"}</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-y-5 rounded-xl bg-white/[0.03] py-4 ring-1 ring-white/[0.06]">
          <Count label="Sent emails" help={HELP.sent} value={sent} Icon={Send} />
          <Count label="Recipients" help={HELP.recipients} value={report.inbox.recipients} Icon={User} />
          <Count label="Received emails" help={HELP.received} value={report.inbox.received} Icon={Inbox} />
          <Count label="Senders" help={HELP.senders} value={report.inbox.senders} Icon={User} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-white/[0.03] py-4 text-center ring-1 ring-white/[0.06]">
          <div className="flex flex-col items-center gap-1">
            <Title text="Opening rate" Icon={MailOpen} help={HELP.opening} />
            <Ring part={report.now.opened} of={report.now.sent} size={112} />
          </div>
          <div className="flex flex-col items-center gap-1">
            <Title text="Link click rate" Icon={MousePointerClick} help={HELP.clicks} />
            <Ring part={report.now.clicked} of={report.now.withLinks} tone="emerald" size={112} />
          </div>
        </div>
      </Panel>
    </div>
  );
}

// ---------- every tracked email ----------

const FILTER_OPTIONS = (Object.keys(EMAIL_FILTERS) as EmailFilter[]).map((f) => ({ value: f, label: EMAIL_FILTERS[f].label }));

// how an email is doing, in words: "2 opens · 1 click", or what stopped it
function Status({ m }: { m: EmailRow }) {
  return (
    <div className="min-w-0">
      <p className="flex flex-wrap items-center gap-1.5 text-sm">
        {m.bouncedAt ? (
          <span className="text-rose-300">Bounced</span>
        ) : m.opens ? (
          <span className="tabular-nums">
            {plural(m.opens, "open")}
            {m.hasLinks && <span className="text-muted"> · {plural(m.clicks, "click")}</span>}
          </span>
        ) : (
          <span className="text-muted">Not opened yet</span>
        )}
        {m.repliedAt && <span className="rounded-full bg-violet-400/15 px-2 py-0.5 text-[11px] font-medium text-violet-300">Replied</span>}
      </p>
      <p className="truncate text-xs text-muted">{m.bouncedAt ? `On ${when(m.bouncedAt)}` : m.lastOpenAt ? `Last open on ${when(m.lastOpenAt)}` : ""}</p>
    </div>
  );
}

const Recipients = ({ m }: { m: Pick<EmailRow, "to" | "others"> }) => (
  <div className="flex min-w-0 flex-wrap gap-1">
    {[m.to, ...(m.others ? m.others.split(", ") : [])].slice(0, 3).map((r) => (
      <span key={r} className="max-w-full truncate rounded-full bg-white/[0.06] px-2 py-0.5 text-xs">
        {r}
      </span>
    ))}
  </div>
);

const ROW = "md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_minmax(0,14rem)_1rem]";

export function EmailsView({ rows, filter, more, query }: { rows: EmailRow[]; filter: EmailFilter; more: string | null; query: Query }) {
  return (
    <Panel
      title={<FilterPicker options={FILTER_OPTIONS} value={filter} />}
      aside={
        <a href={`/email/export${query({ tab: "emails", filter })}`} className="btn btn-xs btn-ghost flex items-center gap-1.5">
          <Download size={12} /> Download CSV
        </a>
      }
      footer={
        more && (
          <div className="text-center">
            <Link href={more} scroll={false} className="btn btn-sm btn-ghost">
              Show more
            </Link>
          </div>
        )
      }
    >
      {!rows.length ? (
        <Empty>No emails here yet</Empty>
      ) : (
        <div className="flex flex-col">
          <div className={`hidden gap-x-4 border-b border-white/[0.06] pb-2 text-xs font-medium text-muted md:grid ${ROW}`}>
            <span>Recipients</span>
            <span>Email</span>
            <span>Activity</span>
          </div>
          {rows.map((m) => (
            <Link key={m.id} href={query({ tab: "emails", mail: m.id })} className={`-mx-2 grid items-center gap-x-4 gap-y-1.5 rounded-xl border-b border-white/[0.05] px-2 py-3 transition-colors last:border-0 hover:bg-white/[0.03] ${ROW}`}>
              <Recipients m={m} />
              <div className="min-w-0">
                <p className="truncate text-sm">{m.subject || "No subject"}</p>
                <p className="truncate text-xs text-muted">
                  Sent on {when(m.sentAt)} from {m.from}
                </p>
              </div>
              <Status m={m} />
              <ChevronRight size={14} className="hidden text-muted md:block" />
            </Link>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ---------- one email ----------

const STEP: Record<MailStep["kind"], { Icon: LucideIcon; tone: string }> = {
  sent: { Icon: Send, tone: "bg-white/[0.06] text-muted" },
  open: ACTIVITY.open,
  click: ACTIVITY.click,
  pdf: ACTIVITY.pdf,
  reply: ACTIVITY.reply,
  bounce: ACTIVITY.bounce,
};

export function MailView({ m, gmail, back, now }: { m: MailDetail; gmail: string | null; back: string; now: number }) {
  const today = istDate(new Date(now).toISOString());
  const yesterday = istDate(new Date(now - 86_400_000).toISOString());
  const days = [...new Set(m.steps.map((s) => istDate(s.at)))];
  const dayName = (d: string) => (d === today ? "Today" : d === yesterday ? "Yesterday" : day(`${d}T12:00:00+05:30`));
  const what = (s: MailStep) =>
    ({
      sent: <>Sent to {m.to}</>,
      open: <>Opened by {m.to}</>,
      click: <>Clicked {s.url ? <span className="text-accent">{host(s.url)}</span> : "a link"}</>,
      pdf: (
        <>
          Read the PDF {s.url && <span className="text-foreground">{s.url}</span>}
          {s.seconds ? ` for ${duration(s.seconds)}` : ""}
        </>
      ),
      reply: <>{m.to} replied</>,
      bounce: <>Bounced: it didn&apos;t reach {m.to}</>,
    })[s.kind];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <Link href={back} className="text-muted hover:text-foreground">
          Email tracking
        </Link>
        <span className="text-muted">/</span>
        <span className="min-w-0 truncate">{m.subject || "No subject"}</span>
      </div>
      <Panel
        title={<h2 className="min-w-0 text-lg font-semibold">{m.subject || "No subject"}</h2>}
        aside={
          gmail && (
            <a href={gmail} target="_blank" rel="noreferrer" className="btn btn-xs btn-ghost flex items-center gap-1.5">
              <ExternalLink size={12} /> Open in Gmail
            </a>
          )
        }
      >
        <dl className="grid gap-x-6 gap-y-3 rounded-xl bg-white/[0.03] p-4 text-sm ring-1 ring-white/[0.06] sm:grid-cols-[8rem_minmax(0,1fr)]">
          <dt className="text-muted">Recipients</dt>
          <dd>
            <Recipients m={m} />
          </dd>
          <dt className="text-muted">Sent from</dt>
          <dd className="truncate">{m.from}</dd>
          <dt className="text-muted">Send date</dt>
          <dd>{when(m.sentAt)}</dd>
          <dt className="text-muted">Activity</dt>
          <dd>
            <Status m={m} />
          </dd>
        </dl>
      </Panel>
      <Panel title={<Title text="Email activity" />}>
        <div className="flex flex-col gap-4">
          {days.map((d) => (
            <div key={d}>
              <div className="mb-2 flex items-center gap-3">
                <span className="h-px flex-1 bg-white/[0.06]" />
                <span className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-[11px] text-muted">{dayName(d)}</span>
                <span className="h-px flex-1 bg-white/[0.06]" />
              </div>
              {m.steps
                .filter((s) => istDate(s.at) === d)
                .map((s, i) => {
                  const { Icon, tone } = STEP[s.kind];
                  return (
                    <div key={`${s.kind}-${s.at}-${i}`} className="flex items-center gap-3 py-1.5">
                      <span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${tone}`}>
                        <Icon size={14} />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-muted">{what(s)}</span>
                      <span className="shrink-0 text-xs text-muted tabular-nums">{time(s.at)}</span>
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

// ---------- link clicks ----------

export function LinksView({ rows, csv }: { rows: LinkRow[]; csv: string }) {
  return (
    <Panel
      title={<Title text="Link clicks" />}
      aside={
        <a href={csv} className="btn btn-xs btn-ghost flex items-center gap-1.5">
          <Download size={12} /> Download CSV
        </a>
      }
    >
      {!rows.length ? (
        <Empty>No clicks yet</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="pb-2 pr-3 font-medium">Recipient</th>
                <th className="pb-2 pr-3 font-medium">Link</th>
                <th className="pb-2 pr-3 font-medium">Last clicked</th>
                <th className="pb-2 text-right font-medium">Total clicks</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.to}-${r.url}`} className="border-t border-white/[0.06]">
                  <td className="max-w-[14rem] truncate py-2.5 pr-3">{r.to}</td>
                  <td className="max-w-[22rem] truncate py-2.5 pr-3">
                    <a href={r.url} target="_blank" rel="noreferrer" className="text-muted hover:text-foreground">
                      {r.url}
                    </a>
                  </td>
                  <td className="py-2.5 pr-3 text-muted">{when(r.lastAt)}</td>
                  <td className="py-2.5 text-right tabular-nums">{r.clicks === 1 ? "Clicked once" : r.clicks === 2 ? "Clicked twice" : `Clicked ${r.clicks} times`}</td>
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
    <Panel title={<Title text="PDF analytics" />} aside={upload}>
      {!docs.length ? (
        <Empty>No PDFs yet. Upload one, then paste its link into an email.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="pb-2 pr-3 font-medium">PDF</th>
                <th className="pb-2 pr-3 text-right font-medium">Sent in</th>
                <th className="pb-2 pr-3 text-right font-medium">
                  <span className="inline-flex items-center gap-1">
                    Viewed <Info label="Viewed" text={HELP.pdfViewed} />
                  </span>
                </th>
                <th className="pb-2 pr-3 text-right font-medium">
                  <span className="inline-flex items-center gap-1">
                    Time spent <Info label="Time spent" text={HELP.pdfTime} />
                  </span>
                </th>
                <th className="pb-2 pr-3 text-right font-medium">Downloads</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id} className="border-t border-white/[0.06]">
                  <td className="py-2.5 pr-3">
                    <Link href={`/email?tab=pdfs&doc=${d.id}`} className="flex min-w-0 items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-400/15 text-amber-300">
                        <FileText size={16} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate">{d.name}</span>
                        <span className="block truncate text-xs text-muted">
                          {d.pages ? `${plural(d.pages, "page")} · ` : ""}Added {day(d.createdAt)}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{plural(d.sends, "email")}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">
                    {d.sends ? `${pct(d.viewedSends, d.sends)}%` : "–"}
                    <span className="block text-xs text-muted">{d.sends ? `${d.viewedSends} of ${d.sends}` : ""}</span>
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{d.seconds ? duration(d.seconds) : "–"}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{d.downloads}</td>
                  <td className="py-2.5 text-right">
                    <CopyLink url={`${origin}/d/${d.id}`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
  const total = doc.views.reduce((n, v) => n + v.seconds, 0);
  const downloads = doc.views.filter((v) => v.downloaded).length;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href="/email?tab=pdfs" className="text-muted hover:text-foreground">
          PDF analytics
        </Link>
        <span className="text-muted">/</span>
        <span className="min-w-0 truncate">{doc.name}</span>
        <div className="ml-auto flex items-center gap-1">
          <CopyLink url={`${origin}/d/${doc.id}`} />
          <DeletePdf id={doc.id} name={doc.name} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Readings" value={doc.views.length} Icon={Eye} />
        <StatTile label="Time spent on the PDF" value={total ? duration(total) : "–"} lit={total > 0} Icon={Clock} />
        <StatTile label="Downloaded" value={downloads ? plural(downloads, "time") : "No"} lit={downloads > 0} Icon={Download} tone="emerald" />
      </div>
      <Panel title={<Title text="Time on each page" help={HELP.pdfPages} />}>
        <Bars labels={seconds.map((_, i) => `Page ${i + 1}`)} values={seconds} unit="seconds" empty="Not read yet" format={duration} />
      </Panel>
      <Panel title={<Title text="Readings" />}>
        {!doc.views.length ? (
          <Empty>Not read yet</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="pb-2 pr-3 font-medium">Reader</th>
                  <th className="pb-2 pr-3 font-medium">Opened</th>
                  <th className="pb-2 pr-3 text-right font-medium">Time spent</th>
                  <th className="pb-2 pr-3 text-right font-medium">Pages seen</th>
                  <th className="pb-2 text-right font-medium">Downloaded</th>
                </tr>
              </thead>
              <tbody>
                {doc.views.map((v) => (
                  <tr key={v.id} className="border-t border-white/[0.06]">
                    <td className="max-w-[16rem] truncate py-2.5 pr-3">{v.to ?? "Someone with the link"}</td>
                    <td className="py-2.5 pr-3 text-muted">{when(v.startedAt)}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{duration(v.seconds)}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">
                      {v.visited} of {pages} <span className="text-muted">({pct(v.visited, pages)}%)</span>
                    </td>
                    <td className="py-2.5 text-right">{v.downloaded ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

// ---------- the report ----------

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
  query: Query;
  inboxOn: boolean;
  connectHref: string | null;
}) {
  const sent = inboxOn ? p.inbox.sent : p.now.sent;
  const sentBefore = inboxOn ? p.inboxBefore.sent : p.before.sent;
  const label = (d: string) => (p.unit === "month" ? new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { month: "short" }) : day(`${d}T00:00:00+05:30`));
  const series = slots(p).map((d) => p.byDay.find((x) => x.d === d) ?? { d, sent: 0, received: 0, tracked: 0 });
  const top = by === "domain" ? domains(p.top) : p.top.slice(0, 15);
  const most = Math.max(1, ...top.map((t) => t.sent + t.received));
  const against = `against ${p.prevLabel}`;
  const rates = [
    { title: "Opening rate", help: HELP.opening, Icon: MailOpen, part: p.now.opened, of: p.now.sent, prev: [p.before.opened, p.before.sent], what: "Emails sent and opened" },
    { title: "Link click rate", help: HELP.clicks, Icon: MousePointerClick, part: p.now.clicked, of: p.now.withLinks, prev: [p.before.clicked, p.before.withLinks], what: "Emails with links, and clicked", tone: "emerald" as const },
    { title: "PDF viewed rate", help: HELP.pdfs, Icon: FileText, part: p.now.docsViewed, of: p.now.docsSent, prev: [p.before.docsViewed, p.before.docsSent], what: "Emails with PDFs, and read" },
  ];
  return (
    <div className="flex flex-col gap-4">
      {!inboxOn && connectHref && (
        <div className="flex justify-end">
          <Link href={connectHref} className="btn btn-xs btn-ghost">
            Connect the sales inbox
          </Link>
        </div>
      )}

      <section className="panel grid items-center gap-5 rounded-2xl p-6 md:grid-cols-2">
        <div className="text-center">
          <p className="text-xs text-muted">Report</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{p.label}</p>
          <nav className="mt-3 flex flex-wrap justify-center gap-1">
            {(Object.keys(RANGES) as Range[]).map((r) => (
              <Link key={r} aria-current={r === range ? "page" : undefined} href={query({ tab: "performance", range: r })} scroll={false} className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${r === range ? "bg-white/[0.08] text-foreground" : "text-accent hover:bg-white/[0.04]"}`}>
                {RANGES[r]}
              </Link>
            ))}
          </nav>
        </div>
        <div className="text-center">
          <p className="flex items-center justify-center gap-1.5 text-sm text-muted">
            <Clock size={14} /> Your average response time <Info label="Your average response time" text={HELP.response} />
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{p.avgResponseSeconds ? duration(Math.round(p.avgResponseSeconds)) : "–"}</p>
        </div>
      </section>

      <section className="panel grid grid-cols-2 gap-y-6 rounded-2xl py-6 lg:grid-cols-4 lg:divide-x lg:divide-white/[0.06]">
        <Count label="Sent emails" help={HELP.sent} value={sent} before={sentBefore} against={against} Icon={Send} />
        <Count label="Recipients" help={HELP.recipients} value={p.inbox.recipients} before={p.inboxBefore.recipients} against={against} Icon={User} />
        <Count label="Received emails" help={HELP.received} value={p.inbox.received} before={p.inboxBefore.received} against={against} Icon={Inbox} />
        <Count label="Senders" help={HELP.senders} value={p.inbox.senders} before={p.inboxBefore.senders} against={against} Icon={User} />
      </section>

      <Panel title={<Title text="When you send your emails" help={HELP.sendHeat} />} aside={<HeatLegend />}>
        <Heatmap cells={p.heat} />
      </Panel>
      <Panel title={<Title text="When you received your emails" help={HELP.receiveHeat} />} aside={<HeatLegend />}>
        <Heatmap cells={p.heatIn} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title={<Title text={p.unit === "month" ? "Emails sent by month" : "Emails sent by day"} help={HELP.sentByDay} Icon={Send} />}>
          <Trend points={series.map((d) => ({ label: label(d.d), value: inboxOn ? d.sent : d.tracked }))} />
        </Panel>
        <Panel title={<Title text="Time until first open" help={HELP.firstOpen} Icon={Clock} />}>
          <Bars labels={WAIT_BUCKETS} values={p.firstOpen} />
        </Panel>
        <Panel title={<Title text={p.unit === "month" ? "Emails received by month" : "Emails received by day"} help={HELP.receivedByDay} Icon={Inbox} />}>
          <Trend points={series.map((d) => ({ label: label(d.d), value: d.received }))} tone="emerald" />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {rates.map((r) => (
          <Panel key={r.title} className="flex flex-col items-center gap-3 text-center">
            <Title text={r.title} help={r.help} Icon={r.Icon} />
            <Ring part={r.part} of={r.of} tone={r.tone} />
            {r.of || r.prev[1] ? (
              <>
                <Change now={pct(r.part, r.of)} before={pct(r.prev[0], r.prev[1])} against={against} />
                <p className="text-xs text-muted">{r.what}, this period and the one before</p>
                <div className="w-full">
                  <Compare
                    tone={r.tone}
                    periods={[
                      { label: p.prevLabel, part: r.prev[0], of: r.prev[1] },
                      { label: p.label, part: r.part, of: r.of },
                    ]}
                  />
                </div>
              </>
            ) : (
              <p className="text-xs text-muted">No tracked emails in this period</p>
            )}
          </Panel>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={<Title text="Time taken to respond" help={HELP.respond} Icon={Clock} />}>
          <Bars labels={WAIT_BUCKETS} values={p.respond} unit="answers" />
        </Panel>
        <Panel title={<Title text="Time taken for first response" help={HELP.firstResponse} Icon={Clock} />}>
          <Bars labels={WAIT_BUCKETS} values={p.firstResponse} unit="answers" />
        </Panel>
      </div>

      <Panel
        title={<Title text="Top interactions" help={HELP.top} Icon={Star} />}
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
          <Empty>No data for this period</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="pb-2 pr-3 font-medium capitalize">{by}</th>
                  <th className="pb-2 pr-3 font-medium">Total</th>
                  <th className="pb-2 pr-3 font-medium">Sent</th>
                  <th className="pb-2 font-medium">Received</th>
                </tr>
              </thead>
              <tbody>
                {top.map((t) => (
                  <tr key={t.who} className="border-t border-white/[0.06]">
                    <td className="max-w-[18rem] truncate py-2 pr-3">{t.who}</td>
                    <td className="w-[22%] py-2 pr-3">
                      <Meter value={t.sent + t.received} max={most} className="bg-emerald-500" />
                    </td>
                    <td className="w-[22%] py-2 pr-3">
                      <Meter value={t.sent} max={most} className="bg-accent/80" />
                    </td>
                    <td className="w-[22%] py-2">
                      <Meter value={t.received} max={most} className="bg-emerald-300/70" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

// a count as a bar and its number
function Meter({ value, max, className }: { value: number; max: number; className: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
        <span className={`block h-full rounded-full ${className}`} style={{ width: `${(value / max) * 100}%` }} />
      </span>
      <span className="w-8 text-right tabular-nums">{value}</span>
    </span>
  );
}

// each day (or month, over a year) of the period, as India's dates
function slots(p: Performance): string[] {
  const out: string[] = [];
  const istDay = (t: number) => new Date(t + 5.5 * 3_600_000).toISOString().slice(0, 10);
  // through the end's own day (a period ending now includes today)
  const last = istDay(new Date(p.end).getTime() - 1);
  for (let t = new Date(p.start).getTime(); istDay(t) <= last; t += 86_400_000) {
    const d = istDay(t);
    const key = p.unit === "month" ? `${d.slice(0, 7)}-01` : d;
    if (out[out.length - 1] !== key) out.push(key);
  }
  return out;
}

function domains(rows: Performance["top"]) {
  const by = new Map<string, { who: string; sent: number; received: number }>();
  for (const r of rows) {
    const d = r.who.split("@")[1] ?? r.who;
    const t = by.get(d) ?? { who: d, sent: 0, received: 0 };
    t.sent += r.sent;
    t.received += r.received;
    by.set(d, t);
  }
  return [...by.values()].sort((a, b) => b.sent + b.received - (a.sent + a.received)).slice(0, 15);
}
