// Live updates: every write to a table the pages show sends a one-line
// "changed" signal over Supabase Realtime, and every open tab refreshes as
// soon as it hears one (see Pulse.tsx). Idempotent; run it again after
// adding a table, or on a new database:
//
//   node --env-file=.env scripts/run.cjs scripts/realtime.ts
//
// It also closes the database to Supabase's public key. The app talks to
// Postgres directly as its owner and never through Supabase's API, and the
// public key has to reach the browser for the live signal, so the key must
// not be able to read or write a single table.
import { prisma } from "@/lib/prisma";

// Written to constantly in the background, or always alongside a change
// that already signals: they'd only refresh every tab for nothing
// (AppSetting: the syncs' "last read" times, every few minutes)
const QUIET = new Set(["ActivityLog", "AiUsage", "ScrapeRun", "ContentItem", "SocialAccount", "KpiSnapshot", "AppSetting", "MailEvent"]);

// The mail tables signal only new rows a page shows, never the background
// around them: an email new to the inbox (the sync re-reads two days, and a
// row already kept inserts nothing), a newly tracked email, a PDF reading
// starting (not its progress every 5 seconds). Checking mail in Gmail
// refreshed every open page, and so did each inbox read (9 Oct 2026).
const NEW_ROWS: Record<string, string> = { MailMessage: "true", TrackedMail: "true", DocView: "true" };
// An open or click signals once it's counted, as its email's numbers change
// (lib/mailTrack.ts refresh): signalling on the raw event (MailEvent, now
// quiet) refreshed pages before the count moved, so they showed the old one.
const CHANGED_ROWS: Record<string, string> = {
  TrackedMail: `exists (select 1 from old_rows o where o.id = new_rows.id and (o.opens, o.clicks, o."repliedAt", o."bouncedAt") is distinct from (new_rows.opens, new_rows.clicks, new_rows."repliedAt", new_rows."bouncedAt"))`,
};

const run = (sql: string) => prisma.$executeRawUnsafe(sql);

// 1. The public key (anon) and signed-in API users (authenticated) get
// nothing in public, now or for tables made later
for (const kind of ["tables", "sequences", "functions"]) {
  await run(`revoke all on all ${kind} in schema public from anon, authenticated`);
  await run(`alter default privileges for role postgres in schema public revoke all on ${kind} from anon, authenticated`);
}

// 2. The signal: which table changed, nothing else, sent over Realtime; and
// a counter bumped with it, which /api/pulse reads. A sequence rather than
// a row: it takes no lock, so writes never queue behind one another, and a
// bump is seen by every connection at once (Postgres's own write counters
// can take seconds to show). A failure here must never fail the write.
await run(`create sequence if not exists public.hq_change_seq`);
await run(`
  create or replace function public.hq_changed() returns trigger
  language plpgsql security definer set search_path = '' as $$
  begin
    perform nextval('public.hq_change_seq');
    perform realtime.send(jsonb_build_object('table', tg_table_name), 'changed', 'hq-changes', false);
    return null;
  exception when others then
    return null;
  end $$`);
// the same, only when the statement's new rows include one that counts
await run(`
  create or replace function public.hq_changed_new() returns trigger
  language plpgsql security definer set search_path = '' as $$
  declare hit boolean;
  begin
    execute format('select exists (select 1 from new_rows where %s)', tg_argv[0]) into hit;
    if hit then
      perform nextval('public.hq_change_seq');
      perform realtime.send(jsonb_build_object('table', tg_table_name), 'changed', 'hq-changes', false);
    end if;
    return null;
  exception when others then
    return null;
  end $$`);
await run(`revoke all on sequence public.hq_change_seq from anon, authenticated`);
await run(`revoke all on function public.hq_changed() from public, anon, authenticated`);
await run(`revoke all on function public.hq_changed_new() from public, anon, authenticated`);

// 3. On every table the pages show, once per statement (a sync that writes
// 200 rows in one statement signals once)
const tables = await prisma.$queryRaw<{ name: string }[]>`
  select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' order by 1`;
const userColumns = await prisma.$queryRaw<{ name: string }[]>`
  select column_name as name from information_schema.columns
  where table_schema = 'public' and table_name = 'User' and column_name <> 'lastSeenAt'`;

for (const { name } of tables) {
  await run(`drop trigger if exists hq_changed on "${name}"`);
  if (QUIET.has(name)) continue;
  await run(`drop trigger if exists hq_changed_rows on "${name}"`);
  if (NEW_ROWS[name]) {
    await run(`create trigger hq_changed after insert on "${name}" referencing new table as new_rows for each statement execute function public.hq_changed_new(${`'${NEW_ROWS[name].replace(/'/g, "''")}'`})`);
    if (CHANGED_ROWS[name])
      await run(`create trigger hq_changed_rows after update on "${name}" referencing old table as old_rows new table as new_rows for each statement execute function public.hq_changed_new(${`'${CHANGED_ROWS[name].replace(/'/g, "''")}'`})`);
    continue;
  }
  // a person's record, but not the "seen at" every open tab bumps
  const events = name === "User" ? `insert or delete or update of ${userColumns.map((c) => `"${c.name}"`).join(", ")}` : "insert or update or delete or truncate";
  await run(`create trigger hq_changed after ${events} on "${name}" for each statement execute function public.hq_changed()`);
}

const open = await prisma.$queryRaw<{ n: bigint }[]>`
  select count(*)::bigint as n from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and has_table_privilege('anon', c.oid, 'SELECT')`;
console.log(`signalling on ${tables.length - QUIET.size} tables; readable with the public key: ${Number(open[0].n)}`);
await prisma.$disconnect();
