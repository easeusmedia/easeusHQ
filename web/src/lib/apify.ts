import { createHash } from "crypto";
import { prisma } from "./prisma.ts";

// Talking to Apify, whose actors scrape clients' public YouTube and
// Instagram pages (lib/contentSync.ts decides what to scrape, and when).
// No Google, Instagram or Facebook login anywhere — just the team's Apify
// API tokens, entered once under Integrations.
//
// There can be several tokens. Each run goes to the first account with
// credit left, so when one runs out for the month the next takes over.

export const APIFY_SETTINGS = {
  tokens: "apify.tokens", // a JSON list, used in order
  token: "apify.token", // the single token an earlier version kept
} as const;
const API = "https://api.apify.com/v2";

export async function apifyTokens(): Promise<string[]> {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: [APIFY_SETTINGS.tokens, APIFY_SETTINGS.token] } } });
  const list = rows.find((r) => r.key === APIFY_SETTINGS.tokens)?.value;
  const single = rows.find((r) => r.key === APIFY_SETTINGS.token)?.value;
  return [...new Set([...(list ? (JSON.parse(list) as string[]) : []), ...(single ? [single] : [])])];
}

// which token a run belongs to, without keeping the token itself anywhere
// else: a run can only be checked with the account that started it
export const tokenTag = (token: string) => createHash("sha256").update(token).digest("hex").slice(0, 12);

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

async function call<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}${path.includes("?") ? "&" : "?"}token=${token}`, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error?.message ?? `Apify answered ${res.status}.`);
  return body as T;
}

// Starts an actor on the first account with credit left. `callback`, when
// given, is where Apify reports the run finished, so its results can be
// collected straight away rather than whenever someone next looks.
export async function startRun(
  actor: string,
  input: Record<string, unknown>,
  callback?: string
): Promise<{ id: string; account: string }> {
  const tokens = await apifyTokens();
  if (!tokens.length) throw new Error("Analytics isn't set up yet — an admin adds an Apify token under Integrations → Client analytics.");
  const hook = callback
    ? `&webhooks=${Buffer.from(
        JSON.stringify([
          {
            eventTypes: ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED", "ACTOR.RUN.TIMED_OUT", "ACTOR.RUN.ABORTED"],
            requestUrl: callback,
          },
        ])
      ).toString("base64")}`
    : "";
  let lastError: Error | null = null;
  for (const token of tokens) {
    const account = await apifyAccount(token).catch(() => null);
    if (account && account.left !== null && account.left < 0.25) continue;
    try {
      const { data } = await call<{ data: { id: string } }>(`/acts/${actor}/runs?maxTotalChargeUsd=3${hook}`, token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return { id: data.id, account: tokenTag(token) };
    } catch (err) {
      // a spent or refused account passes the run on to the next
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw new Error(
    lastError
      ? `Apify wouldn't start the scrape: ${lastError.message}`
      : "Every Apify account is out of credit for this month — add another token under Integrations, or wait for the monthly reset."
  );
}

async function ownerOf(account: string): Promise<string | null> {
  return (await apifyTokens()).find((t) => tokenTag(t) === account) ?? null;
}

// A run's state, and its results once it has succeeded
export async function runResult<T>(
  id: string,
  account: string
): Promise<{ status: string; items?: T[] }> {
  const token = await ownerOf(account);
  if (!token) return { status: "LOST" }; // its token was removed
  const { data } = await call<{ data: { status: string; defaultDatasetId: string } }>(`/actor-runs/${id}`, token);
  if (data.status !== "SUCCEEDED") return { status: data.status };
  const items = await call<T[]>(`/datasets/${data.defaultDatasetId}/items?clean=true&format=json`, token);
  return { status: data.status, items };
}
