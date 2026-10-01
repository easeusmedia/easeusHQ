import { PrismaClient } from "@prisma/client";

// avoid exhausting DB connections from hot-reloading in dev
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// On Vercel every serverless instance builds its own connection pool, and
// Prisma's default size is (cores * 2 + 1). A dozen warm instances is then
// dozens of client connections against Supabase's pooler, which has a cap —
// past it, new connections are refused and the page throws P1001 ("can't
// reach database server"), which is what surfaces as the intermittent
// "this page hit a snag". A serverless function handles one request at a
// time, so one connection each seemed all it could use.
//
// It wasn't: a page's independent queries (Promise.all) then queued behind
// one connection — five took 5 × 14ms, measured on the server — and with
// Fluid compute an instance serves several requests at once, which queued
// behind each other too. A handful each lets them run side by side while
// staying well inside the pooler's limits.
//
// Local dev and scripts too, on the same pooler: on 2 Oct 2026 a dev
// server's uncapped pool (cores * 2 + 1), on top of the day's many deploys,
// filled the pooler's 200 clients and the live site couldn't connect. Only
// on a pgbouncer URL.
function datasourceUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("pgbouncer")) return undefined;
    if (!parsed.searchParams.has("connection_limit")) parsed.searchParams.set("connection_limit", "5");
    return parsed.toString();
  } catch {
    return undefined; // malformed URL — let Prisma report it rather than masking it here
  }
}

const url = datasourceUrl();

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient(url ? { datasources: { db: { url } } } : undefined);

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
