import { redirect } from "next/navigation";
import { after } from "next/server";
import { headers } from "next/headers";
import { getViewer } from "@/lib/viewer";
import { isFounder, seesSalesMail } from "@/lib/scope";
import { gmailAccount } from "@/lib/gmail";
import { syncSalesInboxIfDue } from "@/lib/mailSync";
import { ACTIVITY_TABS, activity, aliases, EMAIL_FILTERS, emails, linkClicks, mailDetail, performance, RANGES, type ActivityTab, type EmailFilter, type Range } from "@/lib/mailReport";
import { docDetail, docs } from "@/lib/docTrack";
import { PrefetchLink as Link } from "@/app/(workspace)/PrefetchLink";
import { AliasPicker, PdfUpload } from "./controls";
import { TrackerChip } from "../TrackerChip";
import { ActivityView, EmailsView, HomeView, LinksView, MailView, PdfDetail, PdfsView, PerformanceView } from "./views";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "home", label: "Home" },
  { key: "activity", label: "Latest activity" },
  { key: "emails", label: "Email tracking" },
  { key: "links", label: "Link clicks" },
  { key: "pdfs", label: "PDF analytics" },
  { key: "performance", label: "My performance" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const nowMs = () => Date.now();

// Sales' email, as Mailsuite's dashboard shows it: from the mail tracker
// (lib/mailTrack.ts), the sales inbox (lib/mailSync.ts) and tracked PDFs
// (lib/docTrack.ts). Level 1 and Sales.
export default async function EmailPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!seesSalesMail(viewer)) redirect("/home");

  const sp = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as Tab) : "home";
  const [all, inbox, host] = await Promise.all([aliases(), gmailAccount("sales"), headers().then((h) => h.get("host"))]);
  const alias = sp.alias && all.includes(sp.alias) ? sp.alias : null;
  const query = (p: Record<string, string>) => `?${new URLSearchParams({ ...(alias ? { alias } : {}), ...p })}`;
  const origin = `${host?.startsWith("localhost") ? "http" : "https"}://${host}`;
  const now = nowMs();
  // the inbox read again, after this page has gone (at most every 10 minutes)
  if (inbox !== null) after(() => syncSalesInboxIfDue());

  let body: React.ReactNode;
  if (tab === "home") {
    const [items, report] = await Promise.all([activity(alias, 8), performance(alias, "day")]);
    body = <HomeView items={items} report={report} now={now} query={query} />;
  } else if (tab === "activity") {
    const show: ActivityTab = sp.show && sp.show in ACTIVITY_TABS ? (sp.show as ActivityTab) : "all";
    const before = sp.before && !Number.isNaN(Date.parse(sp.before)) ? new Date(sp.before) : undefined;
    const items = await activity(alias, 100, before, show);
    body = <ActivityView items={items} tab={show} now={now} query={query} older={items.length === 100 ? query({ tab: "activity", show, before: items[items.length - 1].at }) : null} />;
  } else if (tab === "emails" && sp.mail) {
    // one email, and everything that happened to it
    const m = await mailDetail(sp.mail);
    if (!m) redirect(`/email${query({ tab: "emails" })}`);
    const gmail = m.threadId && inbox ? `https://mail.google.com/mail/?authuser=${encodeURIComponent(inbox)}#all/${m.threadId}` : null;
    body = <MailView m={m} gmail={gmail} back={query({ tab: "emails" })} now={now} />;
  } else if (tab === "emails") {
    const filter: EmailFilter = sp.filter && sp.filter in EMAIL_FILTERS ? (sp.filter as EmailFilter) : "opened";
    const n = Math.min(1000, Math.max(50, Number(sp.n) || 50));
    const rows = await emails(alias, filter, n + 1);
    body = <EmailsView rows={rows.slice(0, n)} filter={filter} more={rows.length > n ? query({ tab, filter, n: String(n + 50) }) : null} query={query} />;
  } else if (tab === "links") {
    body = <LinksView rows={await linkClicks(alias)} csv={`/email/export${query({ tab: "links" })}`} />;
  } else if (tab === "pdfs") {
    const doc = sp.doc ? await docDetail(sp.doc) : null;
    body = doc ? <PdfDetail doc={doc} origin={origin} /> : <PdfsView docs={await docs(alias)} origin={origin} upload={<PdfUpload />} />;
  } else {
    const range: Range = sp.range && sp.range in RANGES ? (sp.range as Range) : "month";
    body = (
      <PerformanceView
        p={await performance(alias, range)}
        range={range}
        by={sp.by === "domain" ? "domain" : "email"}
        query={query}
        inboxOn={inbox !== null}
        connectHref={isFounder(viewer) ? "/integrations" : null}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Email</h1>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <AliasPicker aliases={all} value={alias ?? ""} />
          <TrackerChip />
        </div>
      </div>
      <nav role="tablist" className="mb-5 flex flex-wrap gap-1 rounded-2xl bg-white/[0.03] p-1 ring-1 ring-white/[0.06] sm:w-fit sm:rounded-full">
        {TABS.map((t) => (
          <Link key={t.key} role="tab" aria-selected={t.key === tab} href={query({ tab: t.key })} scroll={false} className="seg rounded-full px-3 py-1 text-sm font-medium">
            {t.label}
          </Link>
        ))}
      </nav>
      {body}
    </div>
  );
}
