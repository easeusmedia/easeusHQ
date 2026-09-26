import type { SocialConnection } from "@prisma/client";
import { prisma } from "./prisma";
import { daysBetween, type ContentRow, type Dashboard } from "./analytics";

// A client's Instagram, read through the Instagram API with Instagram Login
// — the client's (or our) Instagram login on a professional account, no
// Facebook Page needed. It takes a Meta app with the Instagram product
// added; its app id and secret are entered once under Integrations, and
// ${origin}/api/instagram/callback registered on it as the redirect.
//
// While that app is in development mode, each account connected must be
// added to it as an Instagram tester (and accept the invite in Instagram).
// Read-only: nothing is posted or changed.

export const INSTAGRAM_SETTINGS = { appId: "instagram.appId", appSecret: "instagram.appSecret" } as const;
const GRAPH = "https://graph.instagram.com/v25.0";
const SCOPES = "instagram_business_basic,instagram_business_manage_insights";

export async function instagramSettings(): Promise<Record<string, string>> {
  const rows = await prisma.appSetting.findMany({ where: { key: { startsWith: "instagram." } } });
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

async function app() {
  const s = await instagramSettings();
  const id = s[INSTAGRAM_SETTINGS.appId];
  const secret = s[INSTAGRAM_SETTINGS.appSecret];
  if (!id || !secret) throw new Error("The Instagram app isn't set up yet — add it under Integrations first.");
  return { id, secret };
}

export async function instagramConsentUrl(origin: string, state: string): Promise<string> {
  const { id } = await app();
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: `${origin}/api/instagram/callback`,
    response_type: "code",
    scope: SCOPES,
    state,
  });
  return `https://www.instagram.com/oauth/authorize?${params}`;
}

async function call<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message: string = body?.error?.message ?? `Instagram answered ${res.status}.`;
    if (body?.error?.code === 190) throw new Error("The Instagram connection has lapsed — connect the account again.");
    throw new Error(message);
  }
  return body as T;
}

// Finishes connecting: the one-time code for a short-lived token, that for a
// 60-day one, and the account it opened.
export async function connectInstagram(clientId: string, code: string, origin: string): Promise<void> {
  const { id, secret } = await app();
  const res = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      grant_type: "authorization_code",
      redirect_uri: `${origin}/api/instagram/callback`,
      code,
    }),
  });
  const short = await res.json();
  if (!res.ok) throw new Error(short?.error_message ?? short?.error?.message ?? "Instagram wouldn't complete the connection.");
  // documented as { data: [...] }, delivered flat — take either
  const shortToken: string = short.access_token ?? short.data?.[0]?.access_token;

  const long = await call<{ access_token: string; expires_in: number }>(
    `https://graph.instagram.com/access_token?${new URLSearchParams({
      grant_type: "ig_exchange_token",
      client_secret: secret,
      access_token: shortToken,
    })}`
  );
  const me = await call<{ user_id: string; username: string; profile_picture_url?: string }>(
    `${GRAPH}/me?fields=user_id,username,profile_picture_url&access_token=${long.access_token}`
  );

  const data = {
    accountId: String(me.user_id),
    accountName: `@${me.username}`,
    accountImage: me.profile_picture_url ?? null,
    token: long.access_token,
    tokenExpiresAt: new Date(Date.now() + long.expires_in * 1000),
  };
  await prisma.socialConnection.upsert({
    where: { clientId_platform: { clientId, platform: "instagram" } },
    create: { clientId, platform: "instagram", ...data },
    update: data,
  });
  await prisma.analyticsCache.deleteMany({ where: { clientId } });
}

// The token lasts 60 days from its last renewal; renewing needs it to be a
// day old. Every dashboard load past that point renews it, so an account
// that's looked at even once every two months never lapses.
async function token(conn: SocialConnection): Promise<string> {
  const age = Date.now() - conn.updatedAt.getTime();
  const left = (conn.tokenExpiresAt?.getTime() ?? 0) - Date.now();
  if (age < 86_400_000 || left > 50 * 86_400_000) return conn.token;
  const fresh = await call<{ access_token: string; expires_in: number }>(
    `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${conn.token}`
  ).catch(() => null);
  if (!fresh) return conn.token;
  await prisma.socialConnection.update({
    where: { id: conn.id },
    data: { token: fresh.access_token, tokenExpiresAt: new Date(Date.now() + fresh.expires_in * 1000) },
  });
  return fresh.access_token;
}

type Media = {
  id: string;
  caption?: string;
  media_type: string; // IMAGE, VIDEO, CAROUSEL_ALBUM
  media_product_type?: string; // FEED, REELS, STORY
  permalink: string;
  thumbnail_url?: string;
  media_url?: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
};

const REEL_METRICS = "views,reach,likes,comments,shares,saved,total_interactions,ig_reels_avg_watch_time";
const POST_METRICS = "views,reach,likes,comments,shares,saved,total_interactions";

// A post's own numbers. If Instagram won't give insights for one (made
// before the account went professional, say), the public counts stand in.
async function insights(m: Media, accessToken: string): Promise<Record<string, number | null>> {
  const metrics = m.media_product_type === "REELS" ? REEL_METRICS : POST_METRICS;
  try {
    const { data } = await call<{ data: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] }>(
      `${GRAPH}/${m.id}/insights?metric=${metrics}&access_token=${accessToken}`
    );
    const v = (name: string) => {
      const row = data.find((d) => d.name === name);
      return row ? (row.values?.[0]?.value ?? row.total_value?.value ?? null) : null;
    };
    return {
      views: v("views"),
      reach: v("reach"),
      likes: v("likes") ?? m.like_count ?? null,
      comments: v("comments") ?? m.comments_count ?? null,
      shares: v("shares"),
      saves: v("saved"),
      interactions: v("total_interactions"),
      // Instagram gives milliseconds
      avgWatchSec: v("ig_reels_avg_watch_time") === null ? null : v("ig_reels_avg_watch_time")! / 1000,
    };
  } catch {
    return {
      views: null,
      reach: null,
      likes: m.like_count ?? null,
      comments: m.comments_count ?? null,
      shares: null,
      saves: null,
      interactions: null,
      avgWatchSec: null,
    };
  }
}

// a few at a time — Instagram allows only so many calls an hour
async function inBatches<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

const KIND: Record<string, string> = { REELS: "Reel", CAROUSEL_ALBUM: "Carousel", IMAGE: "Post", VIDEO: "Video" };

export async function instagramDashboard(conn: SocialConnection, from: string, to: string): Promise<Dashboard> {
  const accessToken = await token(conn);
  const profile = await call<{ username: string; profile_picture_url?: string; followers_count?: number }>(
    `${GRAPH}/me?fields=username,profile_picture_url,followers_count&access_token=${accessToken}`
  );

  // newest first, page by page, until past the start of the range
  const posts: Media[] = [];
  let next: string | undefined =
    `${GRAPH}/me/media?fields=id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count&limit=50&access_token=${accessToken}`;
  while (next && posts.length < 300) {
    const page: { data: Media[]; paging?: { next?: string } } = await call(next);
    posts.push(...page.data);
    const oldest = page.data.at(-1)?.timestamp.slice(0, 10);
    next = oldest && oldest >= from ? page.paging?.next : undefined;
  }
  const inRange = posts.filter((p) => {
    const day = p.timestamp.slice(0, 10);
    return day >= from && day <= to && p.media_product_type !== "STORY";
  });
  const stats = await inBatches(inRange, 8, (m) => insights(m, accessToken));

  const rows: ContentRow[] = inRange.map((m, i) => ({
    id: m.id,
    title: (m.caption ?? "").split("\n")[0].slice(0, 120) || "(no caption)",
    url: m.permalink,
    thumbnail: m.thumbnail_url ?? (m.media_type === "IMAGE" ? (m.media_url ?? null) : null),
    published: m.timestamp.slice(0, 10),
    kind: m.media_product_type === "REELS" ? "Reel" : (KIND[m.media_type] ?? "Post"),
    stats: {
      ...stats[i],
      engagement: stats[i].reach ? (stats[i].interactions ?? 0) / stats[i].reach! : null,
    },
  }));

  const sum = (k: string) => {
    const vals = rows.map((r) => r.stats[k]).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  };
  const reach = sum("reach");
  const interactions = sum("interactions");
  const reels = rows.filter((r) => r.kind === "Reel" && r.stats.views !== null);
  const viewsByDay = new Map<string, number>();
  for (const r of rows) viewsByDay.set(r.published, (viewsByDay.get(r.published) ?? 0) + (r.stats.views ?? 0));

  return {
    platform: "instagram",
    account: {
      name: `@${profile.username}`,
      image: profile.profile_picture_url ?? conn.accountImage,
      url: `https://www.instagram.com/${profile.username}/`,
      followers: profile.followers_count ?? null,
    },
    from,
    to,
    fetchedAt: new Date().toISOString(),
    metrics: [
      { key: "views", label: "Views", value: sum("views"), format: "count" },
      { key: "reach", label: "Accounts reached", value: reach, format: "count", hint: "Summed across posts — someone who saw two counts twice" },
      {
        key: "engagement",
        label: "Engagement rate",
        value: reach ? (interactions ?? 0) / reach : null,
        format: "percent",
        hint: "Likes, comments, shares and saves, per account reached",
      },
      {
        key: "avgReel",
        label: "Avg views per reel",
        value: reels.length ? reels.reduce((a, r) => a + (r.stats.views ?? 0), 0) / reels.length : null,
        format: "count",
      },
      { key: "likes", label: "Likes", value: sum("likes"), format: "count" },
      { key: "comments", label: "Comments", value: sum("comments"), format: "count" },
      { key: "shares", label: "Shares", value: sum("shares"), format: "count" },
      { key: "saves", label: "Saves", value: sum("saves"), format: "count" },
      { key: "posts", label: "Posts", value: rows.length, format: "count" },
    ],
    series: daysBetween(from, to).map((day) => ({ day, value: viewsByDay.get(day) ?? 0 })),
    seriesLabel: "Views, by the day each post went up",
    columns: [
      { key: "views", label: "Views", format: "count" },
      { key: "reach", label: "Reach", format: "count" },
      { key: "likes", label: "Likes", format: "count" },
      { key: "comments", label: "Comments", format: "count" },
      { key: "shares", label: "Shares", format: "count" },
      { key: "saves", label: "Saves", format: "count" },
      { key: "engagement", label: "Engagement", format: "percent" },
      { key: "avgWatchSec", label: "Avg watch", format: "seconds" },
    ],
    rows,
    notes: [
      "Everything here is for posts published in the range, counted over each post's whole life so far.",
      ...(posts.length >= 300 ? ["Only the latest 300 posts are looked at."] : []),
    ],
  };
}
