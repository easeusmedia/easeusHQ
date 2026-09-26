import { createHash } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.ts";

// Client analytics comes from public pages, scraped by Apify actors —
// YouTube's (streamers/youtube-scraper) and Instagram's
// (apify/instagram-scraper). No Google, Instagram or Facebook login, and
// nothing asked of any client: just the team's Apify API tokens, entered
// once under Integrations.
//
// There can be several tokens. Each scrape goes to the first account with
// credit left, so when one runs out for the month the next takes over.
//
// A scrape takes from half a minute to a few minutes — longer than a page
// request should wait — so it runs in the background: the first look starts
// it, the Analytics tab polls, and the result is kept for a few hours.

export const APIFY_SETTINGS = {
  tokens: "apify.tokens", // a JSON list, used in order
  token: "apify.token", // the single token an earlier version kept
} as const;
const API = "https://api.apify.com/v2";
// a finished scrape is kept this long before another is started
const FRESH_MS = 6 * 60 * 60 * 1000;
// a scrape still "running" after this is treated as lost and started again
const STALE_MS = 15 * 60 * 1000;

export async function apifyTokens(): Promise<string[]> {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: [APIFY_SETTINGS.tokens, APIFY_SETTINGS.token] } } });
  const list = rows.find((r) => r.key === APIFY_SETTINGS.tokens)?.value;
  const single = rows.find((r) => r.key === APIFY_SETTINGS.token)?.value;
  return [...new Set([...(list ? (JSON.parse(list) as string[]) : []), ...(single ? [single] : [])])];
}

// which token a running scrape belongs to, without keeping the token itself
// in the cache: a run can only be checked with the account that started it
const tag = (token: string) => createHash("sha256").update(token).digest("hex").slice(0, 12);

// An account's name and what's left of its monthly credit, in dollars
export async function apifyAccount(token: string): Promise<{ username: string; left: number | null } | null> {
  const [me, limits] = await Promise.all([
    fetch(`${API}/users/me?token=${token}`).then((r) => (r.ok ? r.json() : null)),
    fetch(`${API}/users/me/limits?token=${token}`).then((r) => (r.ok ? r.json() : null)),
  ]);
  if (!me) return null;
  const used = limits?.data?.current?.monthlyUsageUsd;
  const max = limits?.data?.limits?.maxMonthlyUsageUsd;
  return { username: me.data.username, left: typeof used === "number" && typeof max === "number" ? max - used : null };
}

async function apify<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}${path.includes("?") ? "&" : "?"}token=${token}`, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error?.message ?? `Apify answered ${res.status}.`);
  return body as T;
}

type Raw<T> =
  | { since: string; fetchedAt: string; results: Record<string, T[]> }
  | { pending: { runs: Record<string, string>; since: string; startedAt: string; account: string } };

// One or more runs of an actor for one account (say, a profile's posts and
// its details), their results back to `since` — from the last scrape if
// it's recent and reaches back far enough, else a new one, "pending" until
// every run is done.
export async function scraped<T>(
  clientId: string,
  key: string,
  since: string,
  refresh: boolean,
  actor: string,
  runs: Record<string, Record<string, unknown>>
): Promise<{ pending: true } | { results: Record<string, T[]>; fetchedAt: string }> {
  const tokens = await apifyTokens();
  if (!tokens.length) throw new Error("Analytics isn't set up yet — an admin adds an Apify token once under Integrations → Client analytics.");
  const hit = await prisma.analyticsCache.findUnique({ where: { clientId_key: { clientId, key } } });
  const raw = hit?.data as Raw<T> | undefined;
  const save = (value: Raw<T>) => {
    const data = value as unknown as Prisma.InputJsonValue;
    return prisma.analyticsCache.upsert({
      where: { clientId_key: { clientId, key } },
      create: { clientId, key, data },
      update: { data, fetchedAt: new Date() },
    });
  };

  const owner = raw && "pending" in raw ? tokens.find((t) => tag(t) === raw.pending.account) : undefined;
  if (raw && "pending" in raw && owner && Date.now() - Date.parse(raw.pending.startedAt) < STALE_MS) {
    const names = Object.keys(raw.pending.runs);
    const states = await Promise.all(
      names.map((n) =>
        apify<{ data: { status: string; defaultDatasetId: string } }>(`/actor-runs/${raw.pending.runs[n]}`, owner).then((r) => r.data)
      )
    );
    if (states.some((s) => ["FAILED", "ABORTED", "TIMED-OUT"].includes(s.status))) {
      await prisma.analyticsCache.delete({ where: { clientId_key: { clientId, key } } });
      throw new Error("The scrape didn't finish — try Refresh in a minute.");
    }
    if (states.some((s) => s.status !== "SUCCEEDED")) return { pending: true };
    const lists = await Promise.all(states.map((s) => apify<T[]>(`/datasets/${s.defaultDatasetId}/items?clean=true&format=json`, owner)));
    const done = {
      since: raw.pending.since,
      fetchedAt: new Date().toISOString(),
      results: Object.fromEntries(names.map((n, i) => [n, lists[i]])),
    };
    await save(done);
    return done;
  }

  if (raw && "results" in raw && !refresh && raw.since <= since && Date.now() - Date.parse(raw.fetchedAt) < FRESH_MS) {
    return raw;
  }

  // the first account with credit left; one that turns out to be spent
  // when the run is asked for passes it on to the next
  let lastError: Error | null = null;
  for (const token of tokens) {
    const account = await apifyAccount(token).catch(() => null);
    if (account && account.left !== null && account.left < 0.25) continue;
    try {
      const ids: Record<string, string> = {};
      for (const [name, input] of Object.entries(runs)) {
        const { data } = await apify<{ data: { id: string } }>(`/acts/${actor}/runs?maxTotalChargeUsd=2`, token, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        ids[name] = data.id;
      }
      await save({ pending: { runs: ids, since, startedAt: new Date().toISOString(), account: tag(token) } });
      return { pending: true };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw new Error(
    lastError
      ? `Apify wouldn't start the scrape: ${lastError.message}`
      : "Every Apify account is out of credit for this month — add another token under Integrations, or wait for the monthly reset."
  );
}
