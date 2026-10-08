import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "./prisma";

// The mail tracker: a Chrome extension (/extension) that, as someone sends
// from Gmail, adds a 1-pixel image and routes the links through here, then
// logs the email. Every load of the image is an open and every pass through
// a link a click, as with Mailsuite. This file holds each person's key, what
// gets recorded, and the numbers the Sales page shows.

// a tracked email's id, as the extension makes them
export const MAIL_ID = /^[A-Za-z0-9_-]{12,40}$/;

const secret = () => {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET isn't set.");
  return s;
};
const mac = (userId: string) => createHmac("sha256", secret()).update(`mail-tracker:${userId}`).digest("base64url").slice(0, 32);

// A person's key: the extension sends it with every email it logs, so the
// email is theirs. It can't be made without the server's secret.
export const trackerKey = (userId: string) => `${userId}.${mac(userId)}`;

// whose key this is, or null
export function keyOwner(key: string | null): string | null {
  const [id, sig] = (key ?? "").split(".");
  if (!id || !sig) return null;
  const want = Buffer.from(mac(id));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got) ? id : null;
}

// the address alone ("Riya <riya@easeus.media>" is riya@easeus.media)
const email = (v: unknown) => (typeof v === "string" ? (v.match(/[^\s<>"',;]+@[^\s<>"',;]+\.[a-z]{2,}/i)?.[0] ?? "").toLowerCase().slice(0, 200) : "");

// An email the extension saw go out. Sending it again (after Undo send) only
// refreshes it.
export async function recordSent(userId: string, input: { id?: unknown; from?: unknown; to?: unknown; subject?: unknown; links?: unknown }): Promise<string | null> {
  const id = typeof input.id === "string" && MAIL_ID.test(input.id) ? input.id : null;
  const to = (Array.isArray(input.to) ? input.to : []).map(email).filter(Boolean).slice(0, 50);
  if (!id || !to.length) return "That email couldn't be read.";
  const links = (Array.isArray(input.links) ? input.links : [])
    .slice(0, 100)
    .map((l) => (typeof l === "string" && /^https?:\/\//i.test(l) ? l.slice(0, 2000) : ""));
  const data = {
    from: email(input.from),
    to: to[0],
    others: to.slice(1).join(", "),
    subject: typeof input.subject === "string" ? input.subject.slice(0, 500) : "",
    links,
    sentAt: new Date(),
    leadId: await leadFor(to[0]),
  };
  // sent again: its links were changed the first time, so it keeps those
  await prisma.trackedMail.upsert({ where: { id }, create: { id, userId, ...data }, update: { ...data, links: links.some(Boolean) ? links : undefined } });
  return null;
}

// the newest lead with this email among its contacts
async function leadFor(address: string): Promise<string | null> {
  const like = `%"${address.replace(/[\\%_]/g, "\\$&")}"%`;
  const rows = await prisma.$queryRaw<{ id: string }[]>`select id from "Lead" where lower(values::text) like ${like} order by "createdAt" desc limit 1`;
  return rows[0]?.id ?? null;
}

// How long the sender's own look at their email covers: Gmail fetches the
// image through Google's proxy either way, so an open this close to the
// extension saying "that was me" is theirs
const SELF_MS = 30_000;

// The image loaded. Not an open: a load straight from Gmail's page (the
// sender's compose window; a recipient's Gmail goes through Google's proxy),
// the sender's own look, or a repeat within 10 seconds (one view, fetched twice).
export async function recordOpen(id: string, fromGmailPage: boolean, agent: string | null) {
  if (fromGmailPage || !MAIL_ID.test(id)) return;
  const mail = await prisma.trackedMail.findUnique({ where: { id }, select: { selfAt: true, lastOpenAt: true } });
  if (!mail) return;
  const now = Date.now();
  if (mail.selfAt && now - mail.selfAt.getTime() < SELF_MS) return;
  if (mail.lastOpenAt && now - mail.lastOpenAt.getTime() < 10_000) return;
  await prisma.mailEvent.create({ data: { mailId: id, kind: "open", agent: agent?.slice(0, 200) } });
  await refresh(id);
}

// A link was used: where it goes, or null for one we don't know. Not a
// click when the person is signed in to the app (their own test).
export async function recordClick(id: string, n: number, staff: boolean, agent: string | null): Promise<string | null> {
  if (!MAIL_ID.test(id)) return null;
  const mail = await prisma.trackedMail.findUnique({ where: { id }, select: { links: true } });
  const url = (mail?.links as string[] | undefined)?.[n];
  if (!url) return null;
  if (!staff) {
    await prisma.mailEvent.create({ data: { mailId: id, kind: "click", link: n, agent: agent?.slice(0, 200) } });
    await refresh(id);
  }
  return url;
}

// One of us looked at a sent email (the extension saw it on their screen;
// the sales inbox is shared, so anyone on the team): opens in the last half
// minute were ours.
export async function recordSelfView(id: string) {
  if (!MAIL_ID.test(id)) return;
  const mail = await prisma.trackedMail.findUnique({ where: { id }, select: { id: true } });
  if (!mail) return;
  await prisma.$transaction([
    prisma.mailEvent.deleteMany({ where: { mailId: id, kind: "open", at: { gte: new Date(Date.now() - SELF_MS) } } }),
    prisma.trackedMail.update({ where: { id }, data: { selfAt: new Date() } }),
  ]);
  await refresh(id);
}

// its counts from its events, and the board's number for its lead
async function refresh(id: string) {
  const kinds = await prisma.mailEvent.groupBy({ by: ["kind"], where: { mailId: id }, _count: true, _min: { at: true }, _max: { at: true } });
  const open = kinds.find((k) => k.kind === "open");
  const mail = await prisma.trackedMail.update({
    where: { id },
    data: { opens: open?._count ?? 0, firstOpenAt: open?._min.at ?? null, lastOpenAt: open?._max.at ?? null, clicks: kinds.find((k) => k.kind === "click")?._count ?? 0 },
    select: { leadId: true },
  });
  // a lead's opens are its first email's (the board shows them on Day 1)
  if (mail.leadId) {
    const first = await prisma.trackedMail.findFirst({ where: { leadId: mail.leadId }, orderBy: { sentAt: "asc" }, select: { opens: true } });
    if (first?.opens) await prisma.lead.updateMany({ where: { id: mail.leadId, opens: { lt: first.opens } }, data: { opens: first.opens } });
  }
}

// ---------- the Sales page's numbers ----------

// As Mailsuite counts them: the open rate is emails opened of emails sent,
// and the click rate emails clicked of the emails that had a link in them
export type MailTotals = { sent: number; opened: number; opens: number; withLinks: number; clicked: number; clicks: number };
export type MailRow = { id: string; from: string; to: string; others: string; subject: string; sentAt: string; opens: number; clicks: number; lastOpenAt: string | null };

// Since a moment: the totals, each sending address's (the sales inbox's
// aliases, one per person), and the latest emails
export async function mailStats(since: Date, latest = 50) {
  const [aliases, rows] = await Promise.all([
    prisma.$queryRaw<({ from: string } & MailTotals)[]>`
      select "from", count(*)::int sent, count(*) filter (where opens > 0)::int opened, coalesce(sum(opens), 0)::int opens,
             count(*) filter (where jsonb_array_length(links) > 0)::int "withLinks",
             count(*) filter (where clicks > 0)::int clicked, coalesce(sum(clicks), 0)::int clicks
      from "TrackedMail" where "sentAt" >= ${since} group by "from" order by sent desc`,
    prisma.trackedMail.findMany({
      where: { sentAt: { gte: since } },
      select: { id: true, from: true, to: true, others: true, subject: true, sentAt: true, opens: true, clicks: true, lastOpenAt: true },
      orderBy: { sentAt: "desc" },
      take: latest,
    }),
  ]);
  const add = (a: MailTotals, b: MailTotals): MailTotals => ({
    sent: a.sent + b.sent,
    opened: a.opened + b.opened,
    opens: a.opens + b.opens,
    withLinks: a.withLinks + b.withLinks,
    clicked: a.clicked + b.clicked,
    clicks: a.clicks + b.clicks,
  });
  return {
    total: aliases.reduce(add, { sent: 0, opened: 0, opens: 0, withLinks: 0, clicked: 0, clicks: 0 }),
    aliases,
    latest: rows.map((r): MailRow => ({ ...r, sentAt: r.sentAt.toISOString(), lastOpenAt: r.lastOpenAt?.toISOString() ?? null })),
  };
}
