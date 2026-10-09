import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { period, type Range } from "./mailPeriod";
export { RANGES, type Range } from "./mailPeriod";

// The Email pages' numbers (Mailsuite's dashboard, rebuilt): what the mail
// tracker counted (lib/mailTrack.ts; only events marked counted) and what
// the sales inbox holds (lib/mailSync.ts). Everything can be narrowed to
// one alias of the sales inbox. Days are India's.

const DAY = 86_400_000;
// a stored time (UTC, without a zone) as India's wall clock
const ist = (col: Prisma.Sql) => Prisma.sql`((${col} at time zone 'UTC') at time zone 'Asia/Kolkata')`;
// whether the sales inbox has been read: if not, the tracker's emails stand in for what was sent
const noInbox = Prisma.sql`not exists (select 1 from "MailMessage" m0 where m0.outgoing)`;

// The people on the boards: every email address in a lead's details. Every
// number here counts only emails to and from them ("only those we've added
// as leads", 9 Oct 2026), and a lead added later brings its earlier emails in.
const LEAD_EMAIL = "[^\\s\"'<>,;:]+@[^\\s\"'<>,;:]+\\.[a-z]{2,}";
export const LEADS = Prisma.sql`(select lower((regexp_matches(l.values::text, ${LEAD_EMAIL}, 'gi'))[1]) from "Lead" l)`;

// leads only, and one alias or all of them: tracked emails by their From,
// inbox messages by From when sent and To when received
const trackedBy = (alias: string | null, t = Prisma.sql`t`) =>
  Prisma.sql`and ${t}."to" in ${LEADS} ${alias ? Prisma.sql`and ${t}."from" = ${alias}` : Prisma.empty}`;
const inboxBy = (alias: string | null) =>
  Prisma.sql`and (case when m.outgoing then m."to" else m."from" end) in ${LEADS} ${
    alias ? Prisma.sql`and ((m.outgoing and m."from" = ${alias}) or (not m.outgoing and m."to" = ${alias}))` : Prisma.empty
  }`;

export async function aliases(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ from: string }[]>`select distinct "from" from "TrackedMail" where "from" <> '' order by 1`;
  return rows.map((r) => r.from);
}

// ---------- latest activity ----------

export type Activity = { kind: "open" | "click" | "reply" | "bounce" | "pdf" | "insight"; at: string; mailId: string | null; to: string; subject: string; nth: number; url: string | null; seconds: number | null };

// Latest activity's tabs, as Mailsuite's: everything, opens, clicks, and
// insights (emails not opened yet)
export const ACTIVITY_TABS = { all: "All", opens: "Opens", clicks: "Clicks", insights: "Insights" } as const;
export type ActivityTab = keyof typeof ACTIVITY_TABS;
const ONLY: Record<ActivityTab, Prisma.Sql> = {
  all: Prisma.sql`true`,
  opens: Prisma.sql`a.kind = 'open'`,
  clicks: Prisma.sql`a.kind = 'click'`,
  insights: Prisma.sql`a.kind = 'insight'`,
};

export async function activity(alias: string | null, limit = 60, before?: Date, tab: ActivityTab = "all"): Promise<Activity[]> {
  const until = before ?? new Date(Date.now() + DAY);
  const rows = await prisma.$queryRaw<(Omit<Activity, "at"> & { at: Date })[]>`
    select * from (
      select e.kind, e.at, t.id "mailId", t."to", t.subject,
        (row_number() over (partition by e."mailId", e.kind order by e.at))::int nth,
        case when e.kind = 'click' then t.links ->> e.link else null end url, null::int seconds
      from "MailEvent" e join "TrackedMail" t on t.id = e."mailId"
      where e.counted ${trackedBy(alias)}
      union all
      select 'reply', t."repliedAt", t.id, t."to", t.subject, 1, null, null from "TrackedMail" t
      where t."repliedAt" is not null ${trackedBy(alias)}
      union all
      select 'bounce', t."bouncedAt", t.id, t."to", t.subject, 1, null, null from "TrackedMail" t
      where t."bouncedAt" is not null ${trackedBy(alias)}
      union all
      select 'pdf', v."startedAt", t.id, coalesce(t."to", ''), d.name,
        (row_number() over (partition by v."docId", v."mailId" order by v."startedAt"))::int, null, v.seconds
      from "DocView" v join "TrackedDoc" d on d.id = v."docId" left join "TrackedMail" t on t.id = v."mailId"
      where not v.self ${trackedBy(alias)}
      union all
      -- sent, and not opened yet (a bounce says so itself)
      select 'insight', t."sentAt", t.id, t."to", t.subject, 1, null, null from "TrackedMail" t
      where t.opens = 0 and t."bouncedAt" is null ${trackedBy(alias)}
    ) a where a.at < ${until} and ${ONLY[tab]} order by a.at desc limit ${limit}`;
  return rows.map((r) => ({ ...r, at: r.at.toISOString() }));
}

// ---------- every tracked email ----------

export const EMAIL_FILTERS = {
  opened: { label: "Last opened emails", where: Prisma.sql`t.opens > 0`, order: Prisma.sql`t."lastOpenAt" desc` },
  all: { label: "All emails", where: Prisma.sql`true`, order: Prisma.sql`t."sentAt" desc` },
  unopened: { label: "Unopened emails", where: Prisma.sql`t.opens = 0 and t."bouncedAt" is null`, order: Prisma.sql`t."sentAt" desc` },
  clicked: { label: "Clicked emails", where: Prisma.sql`t.clicks > 0`, order: Prisma.sql`t."lastOpenAt" desc nulls last, t."sentAt" desc` },
  replied: { label: "Replied emails", where: Prisma.sql`t."repliedAt" is not null`, order: Prisma.sql`t."repliedAt" desc` },
  bounced: { label: "Bounced emails", where: Prisma.sql`t."bouncedAt" is not null`, order: Prisma.sql`t."bouncedAt" desc` },
} as const;
export type EmailFilter = keyof typeof EMAIL_FILTERS;

export type EmailRow = {
  id: string;
  from: string;
  to: string;
  others: string;
  subject: string;
  sentAt: string;
  opens: number;
  lastOpenAt: string | null;
  clicks: number;
  hasLinks: boolean;
  repliedAt: string | null;
  bouncedAt: string | null;
};

export function emails(alias: string | null, filter: EmailFilter, limit: number, offset = 0): Promise<EmailRow[]> {
  const f = EMAIL_FILTERS[filter];
  return emailsWhere(Prisma.sql`${f.where} ${trackedBy(alias)}`, f.order, limit, offset);
}

async function emailsWhere(where: Prisma.Sql, order = Prisma.sql`t."sentAt" desc`, limit = 1, offset = 0): Promise<EmailRow[]> {
  const rows = await prisma.$queryRaw<(Omit<EmailRow, "sentAt" | "lastOpenAt" | "repliedAt" | "bouncedAt"> & Record<"sentAt" | "lastOpenAt" | "repliedAt" | "bouncedAt", Date | null>)[]>`
    select t.id, t."from", t."to", t.others, t.subject, t."sentAt", t.opens, t."lastOpenAt", t.clicks, jsonb_array_length(t.links) > 0 "hasLinks", t."repliedAt", t."bouncedAt"
    from "TrackedMail" t where ${where}
    order by ${order} limit ${limit} offset ${offset}`;
  const iso = (d: Date | null) => d?.toISOString() ?? null;
  return rows.map((r) => ({ ...r, sentAt: r.sentAt!.toISOString(), lastOpenAt: iso(r.lastOpenAt), repliedAt: iso(r.repliedAt), bouncedAt: iso(r.bouncedAt) }));
}

// ---------- one email: what happened to it, newest first ----------

export type MailStep = { kind: "sent" | "open" | "click" | "pdf" | "reply" | "bounce"; at: string; url: string | null; seconds: number | null };
export type MailDetail = EmailRow & { threadId: string | null; steps: MailStep[] };

export async function mailDetail(id: string): Promise<MailDetail | null> {
  const [row] = await emailsWhere(Prisma.sql`t.id = ${id} ${trackedBy(null)}`);
  if (!row) return null;
  const [thread, steps] = await Promise.all([
    prisma.trackedMail.findUnique({ where: { id }, select: { threadId: true } }),
    prisma.$queryRaw<(Omit<MailStep, "at"> & { at: Date })[]>`
      select e.kind, e.at, case when e.kind = 'click' then t.links ->> e.link end url, null::int seconds
      from "MailEvent" e join "TrackedMail" t on t.id = e."mailId" where e."mailId" = ${id} and e.counted
      union all
      select 'pdf', v."startedAt", d.name, v.seconds from "DocView" v join "TrackedDoc" d on d.id = v."docId" where v."mailId" = ${id} and not v.self
      order by 2 desc`,
  ]);
  const at = (iso: string | null, kind: MailStep["kind"]) => (iso ? [{ kind, at: iso, url: null, seconds: null }] : []);
  return {
    ...row,
    threadId: thread?.threadId ?? null,
    steps: [...at(row.bouncedAt, "bounce"), ...at(row.repliedAt, "reply"), ...steps.map((x) => ({ ...x, at: x.at.toISOString() })), ...at(row.sentAt, "sent")].sort((a, b) => b.at.localeCompare(a.at)),
  };
}

// ---------- link clicks: each recipient's each link ----------

export type LinkRow = { to: string; url: string; lastAt: string; clicks: number };

export async function linkClicks(alias: string | null, limit = 500): Promise<LinkRow[]> {
  const rows = await prisma.$queryRaw<(Omit<LinkRow, "lastAt"> & { lastAt: Date })[]>`
    select t."to", t.links ->> e.link url, max(e.at) "lastAt", count(*)::int clicks
    from "MailEvent" e join "TrackedMail" t on t.id = e."mailId"
    where e.kind = 'click' and e.counted ${trackedBy(alias)}
    group by t."to", t.links ->> e.link order by max(e.at) desc limit ${limit}`;
  return rows.map((r) => ({ ...r, lastAt: r.lastAt.toISOString() }));
}

// ---------- performance ----------

export type Rates = { sent: number; opened: number; withLinks: number; clicked: number; docsSent: number; docsViewed: number; replied: number; bounced: number };

async function rates(alias: string | null, from: Date, to: Date): Promise<Rates> {
  const [r] = await prisma.$queryRaw<Rates[]>`
    select count(*)::int sent, count(*) filter (where t.opens > 0)::int opened,
      count(*) filter (where jsonb_array_length(t.links) > 0)::int "withLinks", count(*) filter (where t.clicks > 0)::int clicked,
      count(*) filter (where cardinality(t.docs) > 0)::int "docsSent",
      count(*) filter (where cardinality(t.docs) > 0 and exists (select 1 from "DocView" v where v."mailId" = t.id and not v.self))::int "docsViewed",
      count(*) filter (where t."repliedAt" is not null)::int replied, count(*) filter (where t."bouncedAt" is not null)::int bounced
    from "TrackedMail" t where t."sentAt" >= ${from} and t."sentAt" < ${to} ${trackedBy(alias)}`;
  return r;
}

type Inbox = { sent: number; recipients: number; received: number; senders: number };

async function inbox(alias: string | null, from: Date, to: Date): Promise<Inbox> {
  const [r] = await prisma.$queryRaw<Inbox[]>`
    select count(*) filter (where m.outgoing)::int sent, count(distinct m."to") filter (where m.outgoing)::int recipients,
      count(*) filter (where not m.outgoing)::int received, count(distinct m."from") filter (where not m.outgoing)::int senders
    from "MailMessage" m where m.at >= ${from} and m.at < ${to} ${inboxBy(alias)}`;
  return r;
}

// ---------- replies, from the inbox ----------

// every conversation's first message: the ones we sent first are outreach
const FIRSTS = Prisma.sql`select distinct on (m."threadId") m."threadId", m.at, m.outgoing, m."from", m."to" from "MailMessage" m order by m."threadId", m.at`;
// a person writing back in one of them (not a bounce or an auto-reply)
const ANSWERED = Prisma.sql`exists (select 1 from "MailMessage" r where r."threadId" = f."threadId" and not r.outgoing and not r.auto)`;

export type Replies = { replies: number; started: number; answered: number };

// Replies from the sales inbox, whichever computer sent the email (no
// tracker needed): replies received in the period to conversations we
// started, and of the conversations started in it, how many were answered
async function replies(alias: string | null, from: Date, to: Date): Promise<Replies> {
  const by = Prisma.sql`and f."to" in ${LEADS} ${alias ? Prisma.sql`and f."from" = ${alias}` : Prisma.empty}`;
  const [r] = await prisma.$queryRaw<Replies[]>`
    with f as (${FIRSTS})
    select
      (select count(*) from "MailMessage" r join f on f."threadId" = r."threadId"
        where f.outgoing and not r.outgoing and not r.auto and r.at >= ${from} and r.at < ${to} ${by})::int replies,
      (select count(*) from f where f.outgoing and f.at >= ${from} and f.at < ${to} ${by})::int started,
      (select count(*) from f where f.outgoing and f.at >= ${from} and f.at < ${to} ${by} and ${ANSWERED})::int answered`;
  return r;
}

// ---------- the Sales page's summary ----------

export type AliasSummary = { from: string; sent: number; replies: Replies; tracked: Rates };

// Since a moment, to and from leads: what was sent and the replies (the
// inbox), and the open and click rates of the emails the tracker saw;
// overall and per alias
export async function salesSummary(since: Date) {
  const until = new Date(Date.now() + DAY);
  const [box, rep, tracked, sentBy, trackedBy2] = await Promise.all([
    inbox(null, since, until),
    replies(null, since, until),
    rates(null, since, until),
    prisma.$queryRaw<{ from: string; sent: number }[]>`select "from", count(*)::int sent from "MailMessage" where outgoing and at >= ${since} and "to" in ${LEADS} group by "from"`,
    prisma.$queryRaw<{ from: string }[]>`select distinct "from" from "TrackedMail" where "sentAt" >= ${since} and "to" in ${LEADS}`,
  ]);
  const names = [...new Set([...sentBy.map((a) => a.from), ...trackedBy2.map((a) => a.from)])].filter(Boolean);
  const perAlias: AliasSummary[] = await Promise.all(
    names.map(async (from) => ({
      from,
      sent: sentBy.find((a) => a.from === from)?.sent ?? 0,
      replies: await replies(from, since, until),
      tracked: await rates(from, since, until),
    }))
  );
  return {
    inboxOn: box.sent > 0 || box.received > 0,
    sent: box.sent || tracked.sent,
    replies: rep,
    tracked,
    aliases: perAlias.sort((a, b) => b.sent - a.sent || b.tracked.sent - a.tracked.sent),
  };
}

// waits, bucketed as Mailsuite does them
export const WAIT_BUCKETS = ["<15m", "1h", "2h", "6h", "12h", "1d", "2d", ">2d"];
const bucket = (expr: Prisma.Sql) => Prisma.sql`case
  when ${expr} < interval '15 minutes' then 0 when ${expr} < interval '1 hour' then 1 when ${expr} < interval '2 hours' then 2
  when ${expr} < interval '6 hours' then 3 when ${expr} < interval '12 hours' then 4 when ${expr} < interval '1 day' then 5
  when ${expr} < interval '2 days' then 6 else 7 end`;
const fill = (rows: { b: number; n: number }[]) => WAIT_BUCKETS.map((_, i) => rows.find((r) => r.b === i)?.n ?? 0);

export async function performance(alias: string | null, range: Range) {
  const { start, end, prevStart, label, prevLabel } = period(range);
  const unit = range === "year" ? "month" : "day";
  const [now, before, box, boxBefore, byDay, heat, heatIn, firstOpen, respond, firstResponse, avgResponse, top] = await Promise.all([
    rates(alias, start, end),
    rates(alias, prevStart, start),
    inbox(alias, start, end),
    inbox(alias, prevStart, start),
    // sent and received per day (per month over a year), from the inbox,
    // or the tracker when the inbox isn't connected
    prisma.$queryRaw<{ d: string; sent: number; received: number; tracked: number }[]>`
      select to_char(d, 'YYYY-MM-DD') d, coalesce(sum(sent), 0)::int sent, coalesce(sum(received), 0)::int received, coalesce(sum(tracked), 0)::int tracked from (
        select date_trunc(${unit}, ${ist(Prisma.sql`m.at`)}) d, (m.outgoing)::int sent, (not m.outgoing)::int received, 0 tracked
        from "MailMessage" m where m.at >= ${start} and m.at < ${end} ${inboxBy(alias)}
        union all
        select date_trunc(${unit}, ${ist(Prisma.sql`t."sentAt"`)}), 0, 0, 1 from "TrackedMail" t
        where t."sentAt" >= ${start} and t."sentAt" < ${end} ${trackedBy(alias)}
      ) x group by d order by d`,
    // when emails go out: weekday (0 Sunday) by hour
    prisma.$queryRaw<{ dow: number; h: number; n: number }[]>`
      select extract(dow from ${ist(Prisma.sql`at`)})::int dow, extract(hour from ${ist(Prisma.sql`at`)})::int h, count(*)::int n from (
        select m.at from "MailMessage" m where m.outgoing and m.at >= ${start} and m.at < ${end} ${inboxBy(alias)}
        union all
        select t."sentAt" from "TrackedMail" t where t."sentAt" >= ${start} and t."sentAt" < ${end} ${trackedBy(alias)}
          and ${noInbox}
      ) x group by 1, 2`,
    // and when they come in
    prisma.$queryRaw<{ dow: number; h: number; n: number }[]>`
      select extract(dow from ${ist(Prisma.sql`m.at`)})::int dow, extract(hour from ${ist(Prisma.sql`m.at`)})::int h, count(*)::int n
      from "MailMessage" m where not m.outgoing and m.at >= ${start} and m.at < ${end} ${inboxBy(alias)} group by 1, 2`,
    prisma.$queryRaw<{ b: number; n: number }[]>`
      select ${bucket(Prisma.sql`t."firstOpenAt" - t."sentAt"`)} b, count(*)::int n from "TrackedMail" t
      where t."firstOpenAt" is not null and t."sentAt" >= ${start} and t."sentAt" < ${end} ${trackedBy(alias)} group by 1`,
    // our answers: from an email received to our next email in its conversation
    prisma.$queryRaw<{ b: number; n: number }[]>`
      select ${bucket(Prisma.sql`r.wait`)} b, count(*)::int n from (
        select (select min(o.at) from "MailMessage" o where o."threadId" = m."threadId" and o.outgoing and o.at > m.at) - m.at wait
        from "MailMessage" m where not m.outgoing and not m.auto and m.at >= ${start} and m.at < ${end} ${inboxBy(alias)}
      ) r where r.wait is not null group by 1`,
    // our first answer in a conversation a lead started: from its first
    // email to our first email back (Mailsuite's "first response")
    prisma.$queryRaw<{ b: number; n: number }[]>`
      with f as (${FIRSTS})
      select ${bucket(Prisma.sql`r.wait`)} b, count(*)::int n from (
        select (select min(o.at) from "MailMessage" o where o."threadId" = f."threadId" and o.outgoing and o.at > f.at) - f.at wait
        from f where not f.outgoing and f.at >= ${start} and f.at < ${end} and f."from" in ${LEADS}
          ${alias ? Prisma.sql`and f."to" = ${alias}` : Prisma.empty}
      ) r where r.wait is not null group by 1`,
    prisma.$queryRaw<{ s: number | null }[]>`
      select extract(epoch from avg(r.wait))::float s from (
        select (select min(o.at) from "MailMessage" o where o."threadId" = m."threadId" and o.outgoing and o.at > m.at) - m.at wait
        from "MailMessage" m where not m.outgoing and not m.auto and m.at >= ${start} and m.at < ${end} ${inboxBy(alias)}
      ) r where r.wait is not null`,
    // who we write to and hear from most
    prisma.$queryRaw<{ who: string; sent: number; received: number }[]>`
      select who, sum(sent)::int sent, sum(received)::int received from (
        select case when m.outgoing then m."to" else m."from" end who, (m.outgoing)::int sent, (not m.outgoing)::int received
        from "MailMessage" m where m.at >= ${start} and m.at < ${end} ${inboxBy(alias)}
        union all
        select t."to", 1, 0 from "TrackedMail" t where t."sentAt" >= ${start} and t."sentAt" < ${end} ${trackedBy(alias)} and ${noInbox}
      ) x where who <> '' group by who order by sum(sent) + sum(received) desc limit 200`,
  ]);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    label,
    prevLabel,
    unit,
    now,
    before,
    inbox: box,
    inboxBefore: boxBefore,
    byDay,
    heat,
    heatIn,
    firstOpen: fill(firstOpen),
    respond: fill(respond),
    firstResponse: fill(firstResponse),
    avgResponseSeconds: avgResponse[0]?.s ?? null,
    top,
  };
}
export type Performance = Awaited<ReturnType<typeof performance>>;
