import { prisma } from "./prisma.ts";
import { daysBetween, previousRange, type ContentRow, type Dashboard } from "./analytics.ts";

// Any client's Instagram, from what's public on their profile — followers,
// and every post's views, likes and comments — scraped by Apify's Instagram
// Scraper (apify/instagram-scraper). Nothing is connected, per client or
// otherwise, and the client is never asked for anything; all it takes is
// the team's Apify API token, entered once under Integrations.
//
// A scrape takes half a minute or more, longer than a page request should
// wait, so it runs in the background: the first look starts it, the
// Analytics tab polls, and the result is kept for a few hours.
//
// What's public can't show reach, saves, shares or watch time — Instagram
// keeps those for the account itself.
//
// Cost: Apify charges per post scraped (about $0.0027 on the free tier).

export const APIFY_SETTINGS = { token: "apify.token" } as const;
const ACTOR = "apify~instagram-scraper";
const API = "https://api.apify.com/v2";
// a fresh scrape is kept this long before another is started
const FRESH_MS = 6 * 60 * 60 * 1000;
// a scrape still "running" after this is treated as lost and started again
const STALE_MS = 10 * 60 * 1000;

export type Post = {
  id: string;
  type?: string; // Video, Image, Sidecar
  productType?: string; // clips = a Reel
  url?: string;
  caption?: string;
  timestamp: string;
  likesCount?: number;
  commentsCount?: number;
  videoPlayCount?: number; // what Instagram itself shows as views
  videoViewCount?: number;
  displayUrl?: string;
};
export type Profile = { username: string; fullName?: string; followersCount?: number; postsCount?: number; profilePicUrl?: string };

type Raw =
  | { since: string; fetchedAt: string; posts: Post[]; profile: Profile | null }
  | { pending: { posts: string; details: string; since: string; startedAt: string } };

export async function apifyToken(): Promise<string | null> {
  return (await prisma.appSetting.findUnique({ where: { key: APIFY_SETTINGS.token } }))?.value ?? null;
}

async function apify<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}${path.includes("?") ? "&" : "?"}token=${token}`, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error?.message ?? `Apify answered ${res.status}.`);
  return body as T;
}

async function start(token: string, username: string, input: Record<string, unknown>): Promise<string> {
  const { data } = await apify<{ data: { id: string } }>(`/acts/${ACTOR}/runs?maxTotalChargeUsd=2`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ directUrls: [`https://www.instagram.com/${username}/`], addParentData: false, ...input }),
  });
  return data.id;
}

async function run(token: string, id: string): Promise<{ status: string; datasetId: string }> {
  const { data } = await apify<{ data: { status: string; defaultDatasetId: string } }>(`/actor-runs/${id}`, token);
  return { status: data.status, datasetId: data.defaultDatasetId };
}

async function items<T>(token: string, datasetId: string): Promise<T[]> {
  return apify<T[]>(`/datasets/${datasetId}/items?clean=true&format=json`, token);
}

// The account's posts back to `since` and its profile — from the last
// scrape if it's recent and reaches back far enough, else a new one (and
// "pending" until it's done).
export async function instagramData(
  clientId: string,
  username: string,
  since: string,
  refresh: boolean
): Promise<{ pending: true } | { posts: Post[]; profile: Profile | null; fetchedAt: string }> {
  const token = await apifyToken();
  if (!token) throw new Error("Instagram isn't set up yet — an admin adds the Apify token once under Integrations → Client analytics.");
  const key = `igraw:${username}`;
  const hit = await prisma.analyticsCache.findUnique({ where: { clientId_key: { clientId, key } } });
  const raw = hit?.data as Raw | undefined;
  const save = (data: Raw) =>
    prisma.analyticsCache.upsert({
      where: { clientId_key: { clientId, key } },
      create: { clientId, key, data },
      update: { data, fetchedAt: new Date() },
    });

  if (raw && "pending" in raw && Date.now() - Date.parse(raw.pending.startedAt) < STALE_MS) {
    const [p, d] = await Promise.all([run(token, raw.pending.posts), run(token, raw.pending.details)]);
    const failed = [p, d].find((r) => ["FAILED", "ABORTED", "TIMED-OUT"].includes(r.status));
    if (failed) {
      await prisma.analyticsCache.delete({ where: { clientId_key: { clientId, key } } });
      throw new Error("The Instagram scrape didn't finish — try Refresh in a minute.");
    }
    if (p.status !== "SUCCEEDED" || d.status !== "SUCCEEDED") return { pending: true };
    const [posts, profiles] = await Promise.all([items<Post>(token, p.datasetId), items<Profile>(token, d.datasetId)]);
    const done = { since: raw.pending.since, fetchedAt: new Date().toISOString(), posts, profile: profiles[0] ?? null };
    await save(done);
    return done;
  }

  if (raw && "posts" in raw && !refresh && raw.since <= since && Date.now() - Date.parse(raw.fetchedAt) < FRESH_MS) {
    return raw;
  }

  const [posts, details] = await Promise.all([
    start(token, username, { resultsType: "posts", resultsLimit: 300, onlyPostsNewerThan: since }),
    start(token, username, { resultsType: "details", resultsLimit: 1 }),
  ]);
  await save({ pending: { posts, details, since, startedAt: new Date().toISOString() } });
  return { pending: true };
}

const kindOf = (p: Post) =>
  p.productType === "clips" ? "Reel" : p.type === "Sidecar" ? "Carousel" : p.type === "Video" ? "Video" : "Post";
const viewsOf = (p: Post) => (p.type === "Video" ? (p.videoPlayCount ?? p.videoViewCount ?? null) : null);

// The dashboard from a scrape. Pure, so it can be tested on its own.
export function instagramDashboard(
  username: string,
  profile: Profile | null,
  posts: Post[],
  fetchedAt: string,
  from: string,
  to: string
): Dashboard {
  const prev = previousRange(from, to);
  const day = (p: Post) => p.timestamp.slice(0, 10);
  // pinned posts come back whatever their age; the dates keep them out
  const inRange = posts.filter((p) => day(p) >= from && day(p) <= to);
  const before = posts.filter((p) => day(p) >= prev.from && day(p) <= prev.to);
  const followers = profile?.followersCount ?? null;

  const sum = (list: Post[], f: (p: Post) => number | null | undefined) => list.reduce((n, p) => n + (f(p) ?? 0), 0);
  const views = (list: Post[]) => sum(list, viewsOf);
  const videos = (list: Post[]) => list.filter((p) => viewsOf(p) !== null);
  const avgViews = (list: Post[]) => (videos(list).length ? views(list) / videos(list).length : null);
  // the usual public measure: likes and comments per post, against followers
  const engagement = (list: Post[]) =>
    followers && list.length ? (sum(list, (p) => p.likesCount) + sum(list, (p) => p.commentsCount)) / list.length / followers : null;

  const rows: ContentRow[] = inRange.map((p) => ({
    id: p.id,
    title: (p.caption ?? "").split("\n")[0].slice(0, 120) || "(no caption)",
    url: p.url ?? `https://www.instagram.com/${username}/`,
    // through our own server: Instagram's image host won't serve other sites
    thumbnail: p.displayUrl ? `/api/analytics/thumb?u=${encodeURIComponent(p.displayUrl)}` : null,
    published: day(p),
    kind: kindOf(p),
    stats: {
      views: viewsOf(p),
      likes: p.likesCount ?? null,
      comments: p.commentsCount ?? null,
      engagement: followers ? ((p.likesCount ?? 0) + (p.commentsCount ?? 0)) / followers : null,
    },
  }));

  const byDay = new Map<string, number>();
  for (const r of rows) byDay.set(r.published, (byDay.get(r.published) ?? 0) + (r.stats.views ?? 0));

  return {
    platform: "instagram",
    account: {
      name: `@${profile?.username ?? username}`,
      image: profile?.profilePicUrl ? `/api/analytics/thumb?u=${encodeURIComponent(profile.profilePicUrl)}` : null,
      url: `https://www.instagram.com/${username}/`,
      followers,
    },
    from,
    to,
    fetchedAt,
    metrics: [
      { key: "views", label: "Views", value: views(inRange), previous: views(before), format: "count", hint: "On the reels and videos published in this range, to date" },
      { key: "avgReel", label: "Avg views per reel", value: avgViews(inRange), previous: avgViews(before), format: "count" },
      { key: "engagement", label: "Engagement rate", value: engagement(inRange), previous: engagement(before), format: "percent", hint: "Likes and comments per post, against followers" },
      { key: "posts", label: "Posts published", value: inRange.length, previous: before.length, format: "count" },
      { key: "likes", label: "Likes", value: sum(inRange, (p) => p.likesCount), previous: sum(before, (p) => p.likesCount), format: "count" },
      { key: "comments", label: "Comments", value: sum(inRange, (p) => p.commentsCount), previous: sum(before, (p) => p.commentsCount), format: "count" },
      { key: "followers", label: "Followers", value: followers, format: "count", hint: "The account's total now" },
      { key: "allPosts", label: "Posts, all time", value: profile?.postsCount ?? null, format: "count" },
    ],
    series: daysBetween(from, to).map((d) => ({ day: d, value: byDay.get(d) ?? 0 })),
    seriesLabel: "Views, by the day each post went up",
    columns: [
      { key: "views", label: "Views", format: "count" },
      { key: "likes", label: "Likes", format: "count" },
      { key: "comments", label: "Comments", format: "count" },
      { key: "engagement", label: "Engagement", format: "percent" },
    ],
    rows,
    notes: [
      "Public numbers: each post's views, likes and comments so far, for the posts published in the range — compared with the ones published in the same length of time before.",
      "Reach, saves, shares and watch time are private to the account, so they aren't here.",
    ],
  };
}
