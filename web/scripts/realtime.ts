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
const QUIET = new Set(["ActivityLog", "AiUsage", "ScrapeRun", "ContentItem", "SocialAccount", "KpiSnapshot"]);

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
await run(`revoke all on sequence public.hq_change_seq from anon, authenticated`);
await run(`revoke all on function public.hq_changed() from public, anon, authenticated`);

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
  // a person's record, but not the "seen at" every open tab bumps
  const events = name === "User" ? `insert or delete or update of ${userColumns.map((c) => `"${c.name}"`).join(", ")}` : "insert or update or delete or truncate";
  await run(`create trigger hq_changed after ${events} on "${name}" for each statement execute function public.hq_changed()`);
}

const open = await prisma.$queryRaw<{ n: bigint }[]>`
  select count(*)::bigint as n from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and has_table_privilege('anon', c.oid, 'SELECT')`;
console.log(`signalling on ${tables.length - QUIET.size} tables; readable with the public key: ${Number(open[0].n)}`);
await prisma.$disconnect();
