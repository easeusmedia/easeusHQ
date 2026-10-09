import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "./prisma";

// The mail tracker: a Chrome extension (/extension) that, as someone sends
// from Gmail, adds a 1-pixel image and routes the links through here, then
// logs the email. Every load of the image is an open and every pass through
// a link a click, as with Mailsuite. This file holds each person's key, what
// gets recorded, and the numbers the Sales page shows.

// The Gmail accounts the extension works in: only the sales inbox, never
// anyone's own Gmail open in the same browser
export const TRACKED_INBOXES = ["sales.easeus.media@gmail.com"];

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
export async function recordSent(userId: string, input: { id?: unknown; from?: unknown; to?: unknown; subject?: unknown; links?: unknown; docs?: unknown }): Promise<string | null> {
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
    // tracked PDFs linked in it
    docs: (Array.isArray(input.docs) ? input.docs : []).filter((d): d is string => typeof d === "string" && MAIL_ID.test(d)).slice(0, 20),
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

// The image loaded. Not an open: a load straight from Gmail's page (the
// sender's compose window; a recipient's Gmail goes through Google's proxy),
// or a repeat within 10 seconds (one view, fetched twice). The sender's own
// looks are set aside when counting (refresh).
export async function recordOpen(id: string, fromGmailPage: boolean, agent: string | null) {
  if (fromGmailPage || !MAIL_ID.test(id)) return;
  const mail = await prisma.trackedMail.findUnique({ where: { id }, select: { lastOpenAt: true } });
  if (!mail) return;
  if (mail.lastOpenAt && Date.now() - mail.lastOpenAt.getTime() < 10_000) return;
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
// the sales inbox is shared, so anyone on the team). Kept as its own event:
// an open within half a minute of it, before or after (the two race), was ours.
export async function recordSelfView(id: string) {
  if (!MAIL_ID.test(id)) return;
  const mail = await prisma.trackedMail.findUnique({ where: { id }, select: { id: true } });
  if (!mail) return;
  await prisma.$transaction([prisma.mailEvent.create({ data: { mailId: id, kind: "self" } }), prisma.trackedMail.update({ where: { id }, data: { selfAt: new Date() } })]);
  await refresh(id);
}

// Loads that aren't a person reading: within 20 seconds of sending, or from
// a scanner. Tested on Gmail 8 Oct 2026: an email nobody opened was fetched
// 14 to 18 seconds after delivery as "Chrome/42 ... Edge/12.246", every time.
// They're kept, with what loaded them, but not counted.
const SCANNER = "(Edge/12\\.246|bot|crawl|spider|scan|preview|python|wget|curl)";

// its counts from its events (every one is kept; which count is decided
// here and marked on each, so every report agrees), and the board's number
// for its lead
export async function refresh(id: string) {
  // every click counts; an open counts unless a scanner's, within 20 seconds
  // of sending, next to one of our own looks, or on an email that bounced
  // (a bounce notice carries the email, image and all, and whoever reads it
  // in the sales inbox loads it: seen 8 Oct 2026)
  await prisma.$executeRaw`
    update "MailEvent" e set counted = e.kind = 'click' or (e.kind = 'open' and m."bouncedAt" is null and not (
        e.at < m."sentAt" + interval '20 seconds'
        or coalesce(e.agent, '') ~* ${SCANNER}
        or exists (
          select 1 from "MailEvent" s where s."mailId" = e."mailId" and s.kind = 'self'
            and s.at between e.at - interval '30 seconds' and e.at + interval '30 seconds')))
    from "TrackedMail" m where m.id = e."mailId" and e."mailId" = ${id}`;
  const [c] = await prisma.$queryRaw<{ opens: number; first: Date | null; last: Date | null; clicks: number }[]>`
    select count(*) filter (where kind = 'open')::int opens, min(at) filter (where kind = 'open') first,
           max(at) filter (where kind = 'open') last, count(*) filter (where kind = 'click')::int clicks
    from "MailEvent" where "mailId" = ${id} and counted`;
  const mail = await prisma.trackedMail.update({
    where: { id },
    data: { opens: c?.opens ?? 0, firstOpenAt: c?.first ?? null, lastOpenAt: c?.last ?? null, clicks: c?.clicks ?? 0 },
    select: { leadId: true },
  });
  // a lead's opens are its first email's (the board shows them on Day 1)
  if (mail.leadId) {
    const first = await prisma.trackedMail.findFirst({ where: { leadId: mail.leadId }, orderBy: { sentAt: "asc" }, select: { opens: true } });
    if (first?.opens) await prisma.lead.updateMany({ where: { id: mail.leadId, opens: { lt: first.opens } }, data: { opens: first.opens } });
  }
}
