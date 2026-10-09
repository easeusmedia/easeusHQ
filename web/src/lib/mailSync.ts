import { prisma } from "./prisma";
import { gmail, gmailAccount } from "./gmail";
import { refresh } from "./mailTrack";
import { moveRepliedByEmail } from "./leadMoves";

// The sales inbox (sales.easeus.media@gmail.com), read from Gmail into
// MailMessage: every email sent and received, tracked or not. From it the
// Email pages count everything sent and received, find the replies to
// tracked emails, and time responses. It runs when the Email pages are open
// (at most every 10 minutes) and in the nightly job; each run reads at most
// PER_RUN new messages, and the next run carries on where it stopped.

const SYNCED = "salesGmail.syncedAt";
const TRIED = "salesGmail.triedAt";
// where Gmail's change feed was read up to (History API)
const HISTORY = "salesGmail.historyId";
// the first read goes back to the 1st of last month, so whole months compare
const firstSince = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1) - 5.5 * 3_600_000);
};
// Gmail allows each inbox only so many reads a minute (hit at about 400 on
// 8 Oct 2026), so a run reads fewer, a few at a time, and stops at the first
// "slow down"; the next run carries on
const PER_RUN = 200;

type Header = { name: string; value: string };
type Meta = { id: string; threadId: string; labelIds?: string[]; internalDate: string; payload?: { headers?: Header[] } };

// not a person writing: a bounce, an auto-reply, a no-reply sender
const AUTO_FROM = /mailer-daemon|postmaster|no-?reply|do-?not-?reply|notifications?@/i;
const AUTO_SUBJECT = /^(automatic reply|auto(matic)?[- ]?reply|out of office|undeliverable|delivery status notification|mail delivery (failed|subsystem))/i;
// Mailsuite's own notices: not mail anyone sent us (Mailsuite leaves them
// out of its counts too), and gone once Mailsuite is
const SKIP_FROM = /@(mailsuite\.com|mailtrack\.io)\b/i;
const address = (v: string) => (v.match(/[^\s<>"',;]+@[^\s<>"',;]+\.[a-z]{2,}/i)?.[0] ?? "").toLowerCase();

const setting = async (key: string) => (await prisma.appSetting.findUnique({ where: { key } }))?.value ?? null;
const save = (key: string, value: string) => prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });

// A run, unless one started in the last 10 minutes (pages call this freely)
export async function syncSalesInboxIfDue(every = 10 * 60_000): Promise<void> {
  const tried = await setting(TRIED);
  if (tried && Date.now() - new Date(tried).getTime() < every) return;
  await syncSalesInbox().catch(() => {});
}

export async function syncSalesInbox(forceFull = false): Promise<{ read: number; left: number } | null> {
  if ((await gmailAccount("sales")) === null) return null;
  const startedAt = new Date();
  await save(TRIED, startedAt.toISOString());
  const synced = await setting(SYNCED);
  // two days back from the last full run, so nothing that arrived late is missed
  const since = synced ? new Date(new Date(synced).getTime() - 2 * 86_400_000) : firstSince();
  const from = await setting(HISTORY);

  // Gmail's change feed (below) lists new mail at once in one call; the full
  // search, which takes a few seconds, runs every 10 minutes as the catch-all
  // (and whenever the feed can't be read)
  const ids: string[] = [];
  let pageToken: string | undefined;
  const full = forceFull || !from || !synced || Date.now() - new Date(synced).getTime() >= 10 * 60_000;
  if (full) do {
    // trash too: the team deletes replies and bounces once dealt with, and
    // they still count (in Sep 2026, 114 of 132 emails received were in the
    // trash); spam doesn't
    const q = encodeURIComponent(`after:${Math.floor(since.getTime() / 1000)} -in:chats -in:drafts -in:spam -from:mailsuite.com -from:mailtrack.io`);
    const page = await gmail<{ messages?: { id: string }[]; nextPageToken?: string }>(
      `messages?maxResults=500&includeSpamTrash=true&q=${q}${pageToken ? `&pageToken=${pageToken}` : ""}`,
      "sales"
    );
    ids.push(...(page.messages ?? []).map((m) => m.id));
    pageToken = page.nextPageToken;
  } while (pageToken && ids.length < 10_000);

  // Gmail's change feed too: every email added since the last run, at once.
  // Its search (above) takes a few seconds to list a new email, and a reply
  // read 4 seconds after it came was missed that way, twice (9 Oct 2026).
  // A feed too old to read (Gmail keeps about a week) leaves it to the search.
  let upTo: string | null = null;
  let feedRead = false;
  if (from) {
    let token: string | undefined;
    do {
      const page = await gmail<{ history?: { messagesAdded?: { message: { id: string; labelIds?: string[] } }[] }[]; historyId?: string; nextPageToken?: string }>(
        `history?startHistoryId=${from}&historyTypes=messageAdded&maxResults=500${token ? `&pageToken=${token}` : ""}`,
        "sales"
      ).catch(() => null);
      if (!page) break;
      feedRead = true;
      for (const h of page.history ?? [])
        for (const { message } of h.messagesAdded ?? []) if (!message.labelIds?.some((l) => l === "SPAM" || l === "DRAFT" || l === "CHAT")) ids.push(message.id);
      upTo = page.historyId ?? upTo;
      token = page.nextPageToken;
    } while (token);
  }
  // the feed couldn't be read: the search instead, now
  if (!full && !feedRead) return syncSalesInbox(true);
  // the feed's next start: where it reached, or (first run, or out of date) now
  upTo ??= (await gmail<{ historyId?: string }>("profile", "sales").catch(() => null))?.historyId ?? null;
  if (upTo) await save(HISTORY, upTo);

  const known = new Set((await prisma.mailMessage.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((m) => m.id));
  // oldest first (Gmail lists newest first), so a run cut short leaves the newest for the next
  const fresh = [...new Set(ids)].filter((id) => !known.has(id)).reverse();
  const batch = fresh.slice(0, PER_RUN);

  const rows = [];
  let limited = false;
  for (let i = 0; i < batch.length && !limited; i += 5) {
    const got = await Promise.all(
      batch.slice(i, i + 5).map((id) =>
        gmail<Meta>(`messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject`, "sales").catch((err: Error) => {
          if (/quota|rate limit/i.test(err.message)) limited = true;
          return null;
        })
      )
    );
    for (const m of got) {
      if (!m) continue;
      const header = (name: string) => m.payload?.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? "";
      const outgoing = !!m.labelIds?.includes("SENT");
      const from = header("from");
      const subject = header("subject").slice(0, 300);
      if (SKIP_FROM.test(from)) continue;
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
  // a lead that wrote back moves to Replied by itself
  await moveRepliedByEmail(rows.filter((r) => !r.outgoing && !r.auto)).catch((err) => console.error(err));
  const complete = full && fresh.length <= PER_RUN && !limited;
  if (complete) await save(SYNCED, startedAt.toISOString());
  await link(complete ? startedAt : synced ? new Date(synced) : null);
  return { read: rows.length, left: fresh.length - rows.length };
}

// Tracked emails to their Gmail conversations, then the replies and bounces
// in them (the boards read their leads' straight from the inbox:
// org/space/data.ts). `readTo` is how far the inbox has been read in full.
async function link(readTo: Date | null) {
  // the sent message with its subject to one of its recipients, closest in
  // time within 10 minutes (the subject too: a discarded draft to the same
  // person took the thread of the email sent a minute later, 8 Oct 2026)
  await prisma.$executeRaw`
    update "TrackedMail" t set "threadId" = (
      select m."threadId" from "MailMessage" m
      where m.outgoing and (m."to" = t."to" or position(m."to" in t.others) > 0)
        and lower(btrim(m.subject)) = lower(btrim(left(t.subject, 300)))
        and m.at between t."sentAt" - interval '10 minutes' and t."sentAt" + interval '10 minutes'
      order by abs(extract(epoch from m.at - t."sentAt")) limit 1)
    where t."threadId" is null and t."sentAt" > now() - interval '45 days'`;
  // Logged but never in Gmail's Sent: the extension logs an email when its
  // compose box closes, which a discarded draft, a send Gmail refused and
  // an undone send do too (seen 8 Oct 2026). Once the inbox has been read
  // past it, it goes.
  if (readTo) {
    await prisma.trackedMail.deleteMany({
      where: { threadId: null, sentAt: { lt: new Date(readTo.getTime() - 15 * 60_000), gt: new Date(Date.now() - 45 * 86_400_000) } },
    });
  }
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
  // an email that bounced counts no opens (refresh): its counts again
  for (const t of await prisma.trackedMail.findMany({ where: { bouncedAt: { not: null }, opens: { gt: 0 } }, select: { id: true } })) await refresh(t.id);
}
