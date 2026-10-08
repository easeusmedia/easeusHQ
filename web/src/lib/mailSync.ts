import { prisma } from "./prisma";
import { gmail, gmailAccount } from "./gmail";
import { refresh } from "./mailTrack";
import { leadEmails, phaseKey } from "./space";

// The sales inbox (sales.easeus.media@gmail.com), read from Gmail into
// MailMessage: every email sent and received, tracked or not. From it the
// Email pages count everything sent and received, find the replies to
// tracked emails, and time responses. It runs when the Email pages are open
// (at most every 10 minutes) and in the nightly job; each run reads at most
// PER_RUN new messages, and the next run carries on where it stopped.

const SYNCED = "salesGmail.syncedAt";
const TRIED = "salesGmail.triedAt";
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
  const since = synced ? new Date(new Date(synced).getTime() - 2 * 86_400_000) : firstSince();

  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
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

  const known = new Set((await prisma.mailMessage.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((m) => m.id));
  // oldest first (Gmail lists newest first), so a run cut short leaves the newest for the next
  const fresh = ids.filter((id) => !known.has(id)).reverse();
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
  await link();
  if (fresh.length <= PER_RUN && !limited) await save(SYNCED, startedAt.toISOString());
  return { read: rows.length, left: fresh.length - rows.length };
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
  await leads();
}

// The outreach boards' numbers, from the inbox, whichever computer sent the
// emails: a tracked email sent before its lead was added (or before its
// address was) is joined to it now, for its opens; and a lead whose address
// wrote back after our first email to it (a person, not a bounce) has
// replied, on the day it was at then
export async function leads() {
  const joined = await prisma.$queryRaw<{ id: string }[]>`
    update "TrackedMail" t set "leadId" = l.id from "Lead" l
    where t."leadId" is null and t."sentAt" > now() - interval '45 days'
      and position('"' || t."to" || '"' in lower(l.values::text)) > 0
    returning t.id`;
  for (const t of joined) await refresh(t.id);

  const open = await prisma.lead.findMany({
    where: { replied: false },
    select: {
      id: true,
      values: true,
      stageId: true,
      board: { select: { stages: { select: { id: true, name: true } } } },
      events: { where: { kind: "moved" }, select: { toStage: true, createdAt: true }, orderBy: { createdAt: "asc" } },
    },
  });
  const emails = new Map(open.map((l) => [l.id, leadEmails(l.values)]));
  const all = [...new Set([...emails.values()].flat())];
  if (!all.length) return;
  const [sent, heard] = await Promise.all([
    prisma.mailMessage.groupBy({ by: ["to"], where: { outgoing: true, to: { in: all } }, _min: { at: true } }),
    prisma.mailMessage.findMany({ where: { outgoing: false, auto: false, from: { in: all } }, select: { from: true, at: true }, orderBy: { at: "asc" } }),
  ]);
  const firstTo = new Map(sent.map((s) => [s.to, s._min.at!]));
  for (const lead of open) {
    const mine = emails.get(lead.id) ?? [];
    const first = mine.map((e) => firstTo.get(e)).filter((d): d is Date => !!d).sort((a, b) => +a - +b)[0];
    const reply = first && heard.find((h) => mine.includes(h.from) && h.at > first);
    if (!reply) continue;
    // the stage it was at when the reply came: the last move before it, else where it is
    const moved = lead.events.filter((e) => e.createdAt <= reply.at).pop()?.toStage;
    const stage = lead.board.stages.find((s) => (moved ? s.name === moved : s.id === lead.stageId)) ?? lead.board.stages.find((s) => s.id === lead.stageId);
    if (!stage) continue;
    await prisma.lead.update({ where: { id: lead.id }, data: { replied: true, replies: [{ key: phaseKey(stage), at: reply.at.toISOString() }] } });
  }
}
