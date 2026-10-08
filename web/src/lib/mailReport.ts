import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

// The Email pages' numbers (Mailsuite's dashboard, rebuilt): what the mail
// tracker counted (lib/mailTrack.ts; only events marked counted) and what
// the sales inbox holds (lib/mailSync.ts). Everything can be narrowed to
// one alias of the sales inbox. Days are India's.

const TZ = "Asia/Kolkata";
const DAY = 86_400_000;

// one alias, or all of them: tracked emails by their From, inbox messages
// by From when sent and To when received
const trackedBy = (alias: string | null, t = Prisma.sql`t`) => (alias ? Prisma.sql`and ${t}."from" = ${alias}` : Prisma.empty);
const inboxBy = (alias: string | null) => (alias ? Prisma.sql`and ((m.outgoing and m."from" = ${alias}) or (not m.outgoing and m."to" = ${alias}))` : Prisma.empty);

export async function aliases(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ from: string }[]>`select distinct "from" from "TrackedMail" where "from" <> '' order by 1`;
  return rows.map((r) => r.from);
}

// ---------- latest activity ----------

export type Activity = { kind: "open" | "click" | "reply" | "bounce" | "pdf"; at: string; mailId: string | null; to: string; subject: string; nth: number; url: string | null; seconds: number | null };

export async function activity(alias: string | null, limit = 60, before?: Date): Promise<Activity[]> {
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
      where not v.self ${alias ? Prisma.sql`and t."from" = ${alias}` : Prisma.empty}
    ) a where a.at < ${until} order by a.at desc limit ${limit}`;
  return rows.map((r) => ({ ...r, at: r.at.toISOString() }));
}

// ---------- every tracked email ----------

export const EMAIL_FILTERS = {
  opened: { label: "Last opened", where: Prisma.sql`t.opens > 0`, order: Prisma.sql`t."lastOpenAt" desc` },
  all: { label: "All tracked", where: Prisma.sql`true`, order: Prisma.sql`t."sentAt" desc` },
  unopened: { label: "Not opened", where: Prisma.sql`t.opens = 0 and t."bouncedAt" is null`, order: Prisma.sql`t."sentAt" desc` },
  clicked: { label: "Clicked", where: Prisma.sql`t.clicks > 0`, order: Prisma.sql`t."lastOpenAt" desc nulls last, t."sentAt" desc` },
  replied: { label: "Replied", where: Prisma.sql`t."repliedAt" is not null`, order: Prisma.sql`t."repliedAt" desc` },
  bounced: { label: "Bounced", where: Prisma.sql`t."bouncedAt" is not null`, order: Prisma.sql`t."bouncedAt" desc` },
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
  repliedAt: string | null;
  bouncedAt: string | null;
};

export async function emails(alias: string | null, filter: EmailFilter, limit: number, offset = 0): Promise<EmailRow[]> {
  const f = EMAIL_FILTERS[filter];
  const rows = await prisma.$queryRaw<(Omit<EmailRow, "sentAt" | "lastOpenAt" | "repliedAt" | "bouncedAt"> & Record<"sentAt" | "lastOpenAt" | "repliedAt" | "bouncedAt", Date | null>)[]>`
    select t.id, t."from", t."to", t.others, t.subject, t."sentAt", t.opens, t."lastOpenAt", t.clicks, t."repliedAt", t."bouncedAt"
    from "TrackedMail" t where ${f.where} ${trackedBy(alias)}
    order by ${f.order} limit ${limit} offset ${offset}`;
  const iso = (d: Date | null) => d?.toISOString() ?? null;
  return rows.map((r) => ({ ...r, sentAt: r.sentAt!.toISOString(), lastOpenAt: iso(r.lastOpenAt), repliedAt: iso(r.repliedAt), bouncedAt: iso(r.bouncedAt) }));
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

export const RANGES = {
  day: { label: "Yesterday", days: 1 },
  week: { label: "Last week", days: 7 },
  month: { label: "Last month", days: 30 },
  year: { label: "Last year", days: 365 },
} as const;
export type Range = keyof typeof RANGES;

// the period ends at the start of today in India, so "yesterday" is a whole day
function period(range: Range) {
  const now = new Date();
  const today = new Date(`${new Date(now.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10)}T00:00:00+05:30`);
  const end = range === "day" ? today : now;
  const start = new Date(end.getTime() - RANGES[range].days * DAY);
  return { start, end, prevStart: new Date(start.getTime() - RANGES[range].days * DAY) };
}

type Rates = { sent: number; opened: number; withLinks: number; clicked: number; docsSent: number; docsViewed: number; replied: number; bounced: number };

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

// waits, bucketed as Mailsuite does them
export const WAIT_BUCKETS = ["<15m", "1h", "2h", "6h", "12h", "1d", "2d", ">2d"];
const bucket = (expr: Prisma.Sql) => Prisma.sql`case
  when ${expr} < interval '15 minutes' then 0 when ${expr} < interval '1 hour' then 1 when ${expr} < interval '2 hours' then 2
  when ${expr} < interval '6 hours' then 3 when ${expr} < interval '12 hours' then 4 when ${expr} < interval '1 day' then 5
  when ${expr} < interval '2 days' then 6 else 7 end`;
const fill = (rows: { b: number; n: number }[]) => WAIT_BUCKETS.map((_, i) => rows.find((r) => r.b === i)?.n ?? 0);

export async function performance(alias: string | null, range: Range) {
  const { start, end, prevStart } = period(range);
  const unit = range === "year" ? "month" : "day";
  const [now, before, box, boxBefore, byDay, heat, firstOpen, respond, firstResponse, avgResponse, top] = await Promise.all([
    rates(alias, start, end),
    rates(alias, prevStart, start),
    inbox(alias, start, end),
    inbox(alias, prevStart, start),
    // sent and received per day (per month over a year), from the inbox,
    // or the tracker when the inbox isn't connected
    prisma.$queryRaw<{ d: string; sent: number; received: number; tracked: number }[]>`
      select to_char(d, 'YYYY-MM-DD') d, coalesce(sum(sent), 0)::int sent, coalesce(sum(received), 0)::int received, coalesce(sum(tracked), 0)::int tracked from (
        select date_trunc(${unit}, m.at at time zone ${TZ}) d, (m.outgoing)::int sent, (not m.outgoing)::int received, 0 tracked
        from "MailMessage" m where m.at >= ${start} and m.at < ${end} ${inboxBy(alias)}
        union all
        select date_trunc(${unit}, t."sentAt" at time zone ${TZ}), 0, 0, 1 from "TrackedMail" t
        where t."sentAt" >= ${start} and t."sentAt" < ${end} ${trackedBy(alias)}
      ) x group by d order by d`,
    // when emails go out: weekday (0 Sunday) by hour
    prisma.$queryRaw<{ dow: number; h: number; n: number }[]>`
      select extract(dow from at at time zone ${TZ})::int dow, extract(hour from at at time zone ${TZ})::int h, count(*)::int n from (
        select m.at from "MailMessage" m where m.outgoing and m.at >= ${start} and m.at < ${end} ${inboxBy(alias)}
        union all
        select t."sentAt" from "TrackedMail" t where t."sentAt" >= ${start} and t."sentAt" < ${end} ${trackedBy(alias)}
          and not exists (select 1 from "MailMessage" m2 where m2.outgoing)
      ) x group by 1, 2`,
    prisma.$queryRaw<{ b: number; n: number }[]>`
      select ${bucket(Prisma.sql`t."firstOpenAt" - t."sentAt"`)} b, count(*)::int n from "TrackedMail" t
      where t."firstOpenAt" is not null and t."sentAt" >= ${start} and t."sentAt" < ${end} ${trackedBy(alias)} group by 1`,
    // our answers: from an email received to our next email in its conversation
    prisma.$queryRaw<{ b: number; n: number }[]>`
      select ${bucket(Prisma.sql`r.wait`)} b, count(*)::int n from (
        select (select min(o.at) from "MailMessage" o where o."threadId" = m."threadId" and o.outgoing and o.at > m.at) - m.at wait
        from "MailMessage" m where not m.outgoing and not m.auto and m.at >= ${start} and m.at < ${end} ${inboxBy(alias)}
      ) r where r.wait is not null group by 1`,
    // theirs: from a tracked email to its first reply
    prisma.$queryRaw<{ b: number; n: number }[]>`
      select ${bucket(Prisma.sql`t."repliedAt" - t."sentAt"`)} b, count(*)::int n from "TrackedMail" t
      where t."repliedAt" is not null and t."sentAt" >= ${start} and t."sentAt" < ${end} ${trackedBy(alias)} group by 1`,
    prisma.$queryRaw<{ s: number | null }[]>`
      select extract(epoch from avg(r.wait))::float s from (
        select (select min(o.at) from "MailMessage" o where o."threadId" = m."threadId" and o.outgoing and o.at > m.at) - m.at wait
        from "MailMessage" m where not m.outgoing and not m.auto and m.at >= ${start} and m.at < ${end} ${inboxBy(alias)}
      ) r where r.wait is not null`,
    // who we write to and hear from most
    prisma.$queryRaw<{ who: string; sent: number; received: number; opens: number }[]>`
      select who, sum(sent)::int sent, sum(received)::int received, sum(opens)::int opens from (
        select case when m.outgoing then m."to" else m."from" end who, (m.outgoing)::int sent, (not m.outgoing)::int received, 0 opens
        from "MailMessage" m where m.at >= ${start} and m.at < ${end} ${inboxBy(alias)}
        union all
        select t."to", 0, 0, t.opens from "TrackedMail" t where t."sentAt" >= ${start} and t."sentAt" < ${end} ${trackedBy(alias)}
      ) x where who <> '' group by who order by sum(sent) + sum(received) desc, sum(opens) desc limit 200`,
  ]);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    unit,
    now,
    before,
    inbox: box,
    inboxBefore: boxBefore,
    byDay,
    heat,
    firstOpen: fill(firstOpen),
    respond: fill(respond),
    firstResponse: fill(firstResponse),
    avgResponseSeconds: avgResponse[0]?.s ?? null,
    top,
  };
}
export type Performance = Awaited<ReturnType<typeof performance>>;
