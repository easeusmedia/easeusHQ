import { getViewer } from "@/lib/viewer";
import { seesSalesMail } from "@/lib/scope";
import { aliases, EMAIL_FILTERS, emails, linkClicks, type EmailFilter } from "@/lib/mailReport";

export const dynamic = "force-dynamic";

const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: unknown[][]) => rows.map((r) => r.map(cell).join(",")).join("\n");

// The Email pages' lists as CSV: tracked emails (under their filter) or
// link clicks, as Mailsuite's Download CSV gives them
export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer || !seesSalesMail(viewer)) return new Response("Not allowed.", { status: 403 });
  const q = new URL(request.url).searchParams;
  const all = await aliases();
  const alias = q.get("alias") && all.includes(q.get("alias")!) ? q.get("alias") : null;
  const stamp = new Date().toISOString().slice(0, 10);
  let body: string;
  let name: string;
  if (q.get("tab") === "links") {
    const rows = await linkClicks(alias, 10_000);
    body = csv([["Recipient", "Link", "Last clicked", "Total clicks"], ...rows.map((r) => [r.to, r.url, r.lastAt, r.clicks])]);
    name = `link-clicks-${stamp}.csv`;
  } else {
    const filter: EmailFilter = q.get("filter") && q.get("filter")! in EMAIL_FILTERS ? (q.get("filter") as EmailFilter) : "all";
    const rows = await emails(alias, filter, 20_000);
    body = csv([
      ["Recipient", "Other recipients", "Subject", "Sent from", "Sent at", "Opens", "Last opened", "Clicks", "Replied at", "Bounced at"],
      ...rows.map((r) => [r.to, r.others, r.subject, r.from, r.sentAt, r.opens, r.lastOpenAt, r.clicks, r.repliedAt, r.bouncedAt]),
    ]);
    name = `emails-${filter}-${stamp}.csv`;
  }
  return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` } });
}
