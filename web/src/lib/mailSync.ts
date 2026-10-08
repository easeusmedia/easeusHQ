import { prisma } from "./prisma";
import { gmail, gmailAccount } from "./gmail";

// The sales inbox (sales.easeus.media@gmail.com), read from Gmail into
// MailMessage: every email sent and received, tracked or not. From it the
// Email pages count everything sent and received, find the replies to
// tracked emails, and time responses. It runs when the Email pages are open
// (at most every 10 minutes) and in the nightly job; each run reads at most
// PER_RUN new messages, and the next run carries on where it stopped.

const SYNCED = "salesGmail.syncedAt";
const TRIED = "salesGmail.triedAt";
const FIRST_DAYS = 30;
const PER_RUN = 400;

type Header = { name: string; value: string };
type Meta = { id: string; threadId: string; labelIds?: string[]; internalDate: string; payload?: { headers?: Header[] } };

// not a person writing: a bounce, an auto-reply, a no-reply sender
const AUTO_FROM = /mailer-daemon|postmaster|no-?reply|do-?not-?reply|notifications?@/i;
const AUTO_SUBJECT = /^(automatic reply|auto(matic)?[- ]?reply|out of office|undeliverable|delivery status notification|mail delivery (failed|subsystem))/i;
const address = (v: string) => (v.match(/[^\s<>"',;]+@[^\s<>"',;]+\.[a-z]{2,}/i)?.[0] ?? "").toLowerCase();

const setting = async (key: string) => (await prisma.appSetting.findUnique({ where: { key } }))?.value ?? null;
const save = (key: string, value: string) => prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });

// A run, unless one started in the last 10 minutes (pages call this freely)
export async function syncSalesInboxIfDue(): Promise<void> {
  const tried = await setting(TRIED);
  if (tried && Date.now() - new Date(tried).getTime() < 10 * 60_000) return;
  await syncSalesInbox().catch(() => {});
}

export async function syncSalesInbox(): Promise<{ read: number; left: number } | null> {
  if ((await gmailAccount("sales")) === null) return null;
  const startedAt = new Date();
  await save(TRIED, startedAt.toISOString());
  const synced = await setting(SYNCED);
  // two days back from the last full run, so nothing that arrived late is missed
  const since = synced ? new Date(new Date(synced).getTime() - 2 * 86_400_000) : new Date(Date.now() - FIRST_DAYS * 86_400_000);

  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const q = encodeURIComponent(`after:${Math.floor(since.getTime() / 1000)} -in:chats -in:drafts`);
    const page = await gmail<{ messages?: { id: string }[]; nextPageToken?: string }>(`messages?maxResults=500&q=${q}${pageToken ? `&pageToken=${pageToken}` : ""}`, "sales");
    ids.push(...(page.messages ?? []).map((m) => m.id));
    pageToken = page.nextPageToken;
  } while (pageToken && ids.length < 10_000);

  const known = new Set((await prisma.mailMessage.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((m) => m.id));
  // oldest first (Gmail lists newest first), so a run cut short leaves the newest for the next
  const fresh = ids.filter((id) => !known.has(id)).reverse();
  const batch = fresh.slice(0, PER_RUN);

  const rows = [];
  for (let i = 0; i < batch.length; i += 10) {
    const got = await Promise.all(
      batch.slice(i, i + 10).map((id) =>
        gmail<Meta>(`messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject`, "sales").catch(() => null)
      )
    );
    for (const m of got) {
      if (!m) continue;
      const header = (name: string) => m.payload?.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? "";
      const outgoing = !!m.labelIds?.includes("SENT");
      const from = header("from");
      const subject = header("subject").slice(0, 300);
      rows.push({
        id: m.id,
        threadId: m.threadId,
        outgoing,
        from: address(from),
        to: address(header("to")),
        subject,
        at: new Date(Number(m.internalDate)),
        auto: !outgoing && (AUTO_FROM.test(from) || AUTO_SUBJECT.test(subject)),
      });
    }
  }
  if (rows.length) await prisma.mailMessage.createMany({ data: rows, skipDuplicates: true });
  await link();
  if (fresh.length <= PER_RUN) await save(SYNCED, startedAt.toISOString());
  return { read: rows.length, left: Math.max(0, fresh.length - PER_RUN) };
}

// Tracked emails to their Gmail conversations, then the replies and bounces
// in them, then the board's "Replied" for their leads
async function link() {
  // the sent message to the same address closest in time, within 10 minutes
  await prisma.$executeRaw`
    update "TrackedMail" t set "threadId" = (
      select m."threadId" from "MailMessage" m
      where m.outgoing and m."to" = t."to" and m.at between t."sentAt" - interval '10 minutes' and t."sentAt" + interval '10 minutes'
      order by abs(extract(epoch from m.at - t."sentAt")) limit 1)
    where t."threadId" is null and t."sentAt" > now() - interval '45 days'`;
  // A reply answers the latest tracked email before it in its conversation
  // (a follow-up sent in the same thread takes the reply, not the first email)
  await prisma.$executeRaw`
    with firsts as (
      select distinct on (t.id) t.id, m.at,
        m.auto and m."from" ~* 'mailer-daemon|postmaster' bounce
      from "MailMessage" m
      join lateral (
        select t2.id from "TrackedMail" t2
        where t2."threadId" = m."threadId" and t2."sentAt" < m.at
        order by t2."sentAt" desc limit 1) t on true
      where not m.outgoing and (not m.auto or m."from" ~* 'mailer-daemon|postmaster')
        and m.at > now() - interval '45 days'
      order by t.id, m.at)
    update "TrackedMail" x set
      "repliedAt" = case when f.bounce then x."repliedAt" else coalesce(least(x."repliedAt", f.at), f.at) end,
      "bouncedAt" = case when f.bounce then coalesce(x."bouncedAt", f.at) else x."bouncedAt" end
    from firsts f where f.id = x.id`;
  await prisma.$executeRaw`
    update "Lead" l set replied = true
    where not l.replied and exists (select 1 from "TrackedMail" t where t."leadId" = l.id and t."repliedAt" is not null)`;
}
