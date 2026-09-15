import { test } from "node:test";
import assert from "node:assert/strict";

// The URL rewrite from prisma.ts, isolated so it can be checked without
// constructing a real client. Kept in step with the original by hand — it's
// eight lines and importing prisma.ts would open a database connection.
function datasourceUrl(url: string | undefined, nodeEnv: string): string | undefined {
  if (!url || nodeEnv !== "production") return undefined;
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("pgbouncer")) return undefined;
    if (!parsed.searchParams.has("connection_limit")) parsed.searchParams.set("connection_limit", "1");
    return parsed.toString();
  } catch {
    return undefined;
  }
}

const POOLED = "postgresql://u:p@host.pooler.supabase.com:6543/postgres?pgbouncer=true";

test("caps the pool to one connection on a pooled production URL", () => {
  const out = datasourceUrl(POOLED, "production");
  assert.equal(new URL(out!).searchParams.get("connection_limit"), "1");
});

test("leaves local development alone — one connection would serialise every query", () => {
  assert.equal(datasourceUrl(POOLED, "development"), undefined);
});

test("only touches a pgbouncer URL — a direct connection pools normally", () => {
  assert.equal(datasourceUrl("postgresql://u:p@host:5432/postgres", "production"), undefined);
});

test("never overrides a limit that was set deliberately", () => {
  const out = datasourceUrl(`${POOLED}&connection_limit=5`, "production");
  assert.equal(new URL(out!).searchParams.get("connection_limit"), "5");
});

test("a missing or malformed URL is left for Prisma to report", () => {
  assert.equal(datasourceUrl(undefined, "production"), undefined);
  assert.equal(datasourceUrl("not-a-url", "production"), undefined);
});
