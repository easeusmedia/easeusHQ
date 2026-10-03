// Moves the whole database to a new Supabase project (Tokyo to Mumbai), and
// proves the copy is exact. The new project's addresses go in .env as
// NEW_DATABASE_URL and NEW_DIRECT_URL (Supabase > Connect > ORMs > Prisma),
// so no password ever passes through chat.
//
//   node --env-file=.env scripts/run.cjs scripts/move-db.ts rehearse  prove every table survives the trip (reads only; needs no new database)
//   node --env-file=.env scripts/run.cjs scripts/move-db.ts schema   make the tables there
//   node --env-file=.env scripts/run.cjs scripts/move-db.ts copy     empty them, copy every row, then check
//   node --env-file=.env scripts/run.cjs scripts/move-db.ts check    compare the two, table by table
//
// copy can run again: it empties the new database first, never the old one
// (it refuses if the two addresses are the same project). Run it at a quiet
// time, switch the app over straight after, then run check once more: a
// table that no longer matches was written to in between.
//
// Rows travel as JSON and Postgres itself turns them back into rows
// (jsonb_populate_recordset), so every type arrives as it left: decimals,
// timestamps to the microsecond, enums, arrays, JSON. That takes every
// table in the public schema, the many-to-many ones Prisma makes too.
import { execFileSync } from "child_process";
import { PrismaClient } from "@prisma/client";

const [mode] = process.argv.slice(3); // argv[2] is this script, passed by run.cjs
const OLD = process.env.DIRECT_URL;
const NEW = process.env.NEW_DIRECT_URL;
const NEW_POOLED = process.env.NEW_DATABASE_URL;
if (!OLD) throw new Error("DIRECT_URL isn't set.");

// "postgres.<project>" on the pooler, or the project in the host
const project = (url: string) => {
  const u = new URL(url);
  return `${decodeURIComponent(u.username)}@${u.hostname}`;
};
// the new database's two addresses, and never the old one by mistake
function target(): { direct: string; pooled: string } {
  if (!NEW || !NEW_POOLED) throw new Error("Add NEW_DATABASE_URL and NEW_DIRECT_URL to .env first (the new project's two Prisma addresses).");
  if (project(OLD!) === project(NEW)) throw new Error("NEW_DIRECT_URL is the same database as DIRECT_URL. Nothing was changed.");
  return { direct: NEW, pooled: NEW_POOLED };
}

// one connection each, so a session setting made on it stays in force
const one = (url: string) => {
  const u = new URL(url);
  u.searchParams.set("connection_limit", "1");
  return new PrismaClient({ datasources: { db: { url: u.toString() } } });
};

const BATCH = 200;
const q = (name: string) => `"${name.replace(/"/g, '""')}"`;

type Db = PrismaClient;
const tablesOf = async (db: Db) =>
  (
    await db.$queryRaw<{ name: string }[]>`
      select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relname <> '_prisma_migrations' order by 1`
  ).map((t) => t.name);

// which table points at which (never itself), to copy parents first
const linksOf = (db: Db) =>
  db.$queryRaw<{ child: string; parent: string }[]>`
    select distinct c.relname as child, p.relname as parent
    from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_class p on p.oid = k.confrelid
    join pg_namespace n on n.oid = c.relnamespace
    where k.contype = 'f' and n.nspname = 'public' and c.oid <> p.oid`;

function parentsFirst(tables: string[], links: { child: string; parent: string }[]): string[] {
  const waiting = new Map(tables.map((t) => [t, new Set(links.filter((l) => l.child === t && tables.includes(l.parent)).map((l) => l.parent))]));
  const order: string[] = [];
  while (waiting.size) {
    const ready = [...waiting].filter(([, needs]) => [...needs].every((p) => order.includes(p))).map(([t]) => t);
    // tables that point at each other: any order, which only works with the checks off (below)
    const next = ready.length ? ready : [...waiting.keys()];
    for (const t of next) {
      order.push(t);
      waiting.delete(t);
    }
  }
  return order;
}

// a table's rows and one fingerprint of them all: the same on both sides
// only if every value of every row is
async function fingerprint(db: Db, table: string) {
  const [r] = await db.$queryRawUnsafe<{ n: bigint; sum: string | null }[]>(
    `select count(*)::bigint as n, md5(coalesce(string_agg(h, '' order by h), '')) as sum from (select md5(to_jsonb(t)::text) as h from ${q(table)} t) x`,
  );
  return { rows: Number(r.n), sum: r.sum ?? "" };
}

async function check(from: Db, to: Db) {
  const [a, b] = await Promise.all([tablesOf(from), tablesOf(to)]);
  const missing = a.filter((t) => !b.includes(t));
  if (missing.length) console.log(`Not in the new database: ${missing.join(", ")}`);
  let off = missing.length;
  let total = 0;
  for (const t of a.filter((t) => b.includes(t))) {
    const [x, y] = await Promise.all([fingerprint(from, t), fingerprint(to, t)]);
    total += x.rows;
    if (x.rows !== y.rows || x.sum !== y.sum) {
      off++;
      console.log(`DIFFERENT  ${t}: ${x.rows} rows here, ${y.rows} there${x.rows === y.rows ? " (same count, different values)" : ""}`);
    }
  }
  console.log(off ? `${off} of ${a.length} tables don't match.` : `All ${a.length} tables match: ${total} rows, every value the same.`);
  return off === 0;
}

async function copy(from: Db, to: Db) {
  const [tables, there, links] = await Promise.all([tablesOf(from), tablesOf(to), linksOf(from)]);
  const absent = tables.filter((t) => !there.includes(t));
  if (absent.length) throw new Error(`The new database has no ${absent.join(", ")}. Run "schema" first.`);

  // rows go in without each one's links being checked (they were valid
  // where they came from), so order and tables that point at themselves
  // don't matter; if this database won't allow it, parents-first has to do
  const unchecked = await to.$executeRawUnsafe(`set session_replication_role = replica`).then(
    () => true,
    () => false,
  );
  if (!unchecked) console.log("Copying with link checks on (parents first).");

  await to.$executeRawUnsafe(`truncate ${there.map(q).join(", ")} cascade`);
  const started = Date.now();
  for (const table of parentsFirst(tables, links)) {
    let done = 0;
    for (let offset = 0; ; offset += BATCH) {
      // ctid: the rows in the order they're stored, steady while nothing writes
      const [{ rows, n }] = await from.$queryRawUnsafe<{ rows: string; n: number }[]>(
        `select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)::text as rows, count(*)::int as n from (select * from ${q(table)} order by ctid limit ${BATCH} offset ${offset}) t`,
      );
      if (!n) break;
      await to.$executeRawUnsafe(`insert into ${q(table)} select * from jsonb_populate_recordset(null::${q(table)}, $1::jsonb)`, rows);
      done += n;
      if (n < BATCH) break;
    }
    console.log(`${String(done).padStart(6)}  ${table}`);
  }
  if (unchecked) await to.$executeRawUnsafe(`set session_replication_role = origin`);
  console.log(`Copied in ${Math.round((Date.now() - started) / 1000)}s. Checking…`);
  return check(from, to);
}

// Every table through the same trip the copy makes (rows to JSON and back to
// rows), compared with the original, all inside the old database and without
// writing: if a type didn't survive, it shows here, before anything moves
async function rehearse(db: Db) {
  let off = 0;
  let total = 0;
  const tables = await tablesOf(db);
  for (const t of tables) {
    const [r] = await db.$queryRawUnsafe<{ n: bigint; same: boolean }[]>(
      `with src as (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) as rows from ${q(t)} t),
            back as (select md5(to_jsonb(r)::text) as h from src, jsonb_populate_recordset(null::${q(t)}, src.rows) r),
            orig as (select md5(to_jsonb(t)::text) as h from ${q(t)} t)
       select (select count(*) from orig)::bigint as n,
              (select coalesce(string_agg(h, '' order by h), '') from back) = (select coalesce(string_agg(h, '' order by h), '') from orig) as same`,
    );
    total += Number(r.n);
    if (!r.same) {
      off++;
      console.log(`WOULD CHANGE  ${t}`);
    }
  }
  console.log(off ? `${off} of ${tables.length} tables wouldn't arrive intact.` : `All ${tables.length} tables (${total} rows) survive the trip unchanged.`);
  return off === 0;
}

if (mode === "rehearse") {
  const db = one(OLD);
  try {
    if (!(await rehearse(db))) process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
} else if (mode === "schema") {
  // the tables, straight from prisma/schema.prisma, on the new project
  const { direct, pooled } = target();
  execFileSync("npx", ["prisma", "db", "push", "--skip-generate"], { stdio: "inherit", env: { ...process.env, DATABASE_URL: pooled, DIRECT_URL: direct } });
} else if (mode === "copy" || mode === "check") {
  const from = one(OLD);
  const to = one(target().direct);
  try {
    const ok = await (mode === "copy" ? copy(from, to) : check(from, to));
    if (!ok) process.exitCode = 1;
  } finally {
    await Promise.all([from.$disconnect(), to.$disconnect()]);
  }
} else {
  throw new Error("Say one of: rehearse, schema, copy, check.");
}
