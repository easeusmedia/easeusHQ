import { prisma } from "./prisma";
import { daysBetween, instagramUsername, previousRange, type ContentRow, type Dashboard } from "./analytics";

// Any client's Instagram, from its public numbers — followers, and every
// post's views, likes and comments — through Meta's Business Discovery.
// Nothing is connected per client: the app looks their account up the way
// one business account can look up another. The client's account has to be
// a business or creator account (nearly all are); nothing else is asked.
//
// Who does the looking up is Easeus's own Instagram business account, linked
// to a Facebook Page — connected once under Integrations with a Facebook
// login, through the Meta app "Easeus HQ".
//
// What public data can't show: reach, saves, shares, watch time. Instagram
// keeps those for the account itself.

export const META_SETTINGS = {
  appId: "meta.appId",
  appSecret: "meta.appSecret",
  // a Page token, made from a long-lived login, which doesn't expire
  token: "meta.pageToken",
  igUserId: "meta.igUserId",
  igUsername: "meta.igUsername",
} as const;
const GRAPH = "https://graph.facebook.com/v25.0";
const SCOPES = "instagram_basic,instagram_manage_insights,pages_show_list,pages_read_engagement,business_management";

export async function metaSettings(): Promise<Record<string, string>> {
  const rows = await prisma.appSetting.findMany({ where: { key: { startsWith: "meta." } } });
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

async function app() {
  const s = await metaSettings();
  const id = s[META_SETTINGS.appId];
  const secret = s[META_SETTINGS.appSecret];
  if (!id || !secret) throw new Error("The Meta app isn't set up yet — add it under Integrations first.");
  return { id, secret };
}

export async function metaConsentUrl(origin: string, state: string): Promise<string> {
  const { id } = await app();
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: `${origin}/api/instagram/callback`,
    response_type: "code",
    scope: SCOPES,
    state,
  });
  return `https://www.facebook.com/v25.0/dialog/oauth?${params}`;
}

async function call<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    if (body?.error?.code === 190) throw new Error("The Instagram connection has lapsed — connect it again under Integrations.");
    throw new Error(body?.error?.error_user_msg ?? body?.error?.message ?? `Instagram answered ${res.status}.`);
  }
  return body as T;
}

// Finishes the one Facebook login: a long-lived token, then the Page that
// has an Instagram business account linked, and that Page's own token.
export async function connectMeta(code: string, origin: string): Promise<string> {
  const { id, secret } = await app();
  const short = await call<{ access_token: string }>(
    `${GRAPH}/oauth/access_token?${new URLSearchParams({ client_id: id, client_secret: secret, redirect_uri: `${origin}/api/instagram/callback`, code })}`
  );
  const long = await call<{ access_token: string }>(
    `${GRAPH}/oauth/access_token?${new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: id,
      client_secret: secret,
      fb_exchange_token: short.access_token,
    })}`
  );
  const { data = [] } = await call<{
    data?: { name: string; access_token: string; instagram_business_account?: { id: string; username: string } }[];
  }>(`${GRAPH}/me/accounts?fields=name,access_token,instagram_business_account{id,username}&limit=100&access_token=${long.access_token}`);
  const page = data.find((p) => p.instagram_business_account);
  if (!page) {
    throw new Error(
      "None of the Facebook Pages you picked has an Instagram business account linked. Link Easeus's Instagram to its Page (Instagram → Settings → Accounts Centre), then connect again."
    );
  }
  const values: [string, string][] = [
    [META_SETTINGS.token, page.access_token],
    [META_SETTINGS.igUserId, page.instagram_business_account!.id],
    [META_SETTINGS.igUsername, page.instagram_business_account!.username],
  ];
  for (const [key, value] of values) {
    await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }
  return page.instagram_business_account!.username;
}

type Media = {
  id: string;
  caption?: string;
  like_count?: number;
  comments_count?: number;
  view_count?: number;
  media_type?: string;
  media_product_type?: string;
  permalink?: string;
  timestamp: string;
  thumbnail_url?: string;
  media_url?: string;
};
type Discovery = {
  business_discovery: {
    username: string;
    name?: string;
    profile_picture_url?: string;
    followers_count?: number;
    media_count?: number;
    media?: { data: Media[]; paging?: { cursors?: { after?: string } } };
  };
};

const FULL = "id,caption,like_count,comments_count,view_count,media_type,media_product_type,permalink,timestamp,thumbnail_url,media_url";
// if Meta refuses a field for this account, the ones every account has
const BASIC = "id,caption,like_count,comments_count,media_type,permalink,timestamp,media_url";

async function discover(username: string, fields: string, after?: string): Promise<Discovery> {
  const s = await metaSettings();
  const token = s[META_SETTINGS.token];
  const me = s[META_SETTINGS.igUserId];
  if (!token || !me) throw new Error("Instagram isn't connected yet — an admin connects it once under Integrations → Client analytics.");
  const media = `media${after ? `.after(${after})` : ""}.limit(50){${fields}}`;
  const q = `business_discovery.username(${username}){username,name,profile_picture_url,followers_count,media_count,${media}}`;
  return call<Discovery>(`${GRAPH}/${me}?fields=${encodeURIComponent(q)}&access_token=${token}`);
}

const KIND: Record<string, string> = { CAROUSEL_ALBUM: "Carousel", IMAGE: "Post", VIDEO: "Reel" };

export async function instagramDashboard(input: string, from: string, to: string): Promise<Dashboard> {
  const username = instagramUsername(input);
  if (!username) throw new Error("That doesn't look like an Instagram account — paste its link or @handle.");
  const prev = previousRange(from, to);

  let fields = FULL;
  let first: Discovery;
  try {
    first = await discover(username, fields);
  } catch (err) {
    if (err instanceof Error && /business|creator|cannot be found|does not exist/i.test(err.message)) {
      throw new Error(`@${username} couldn't be looked up — it has to be a public business or creator account.`);
    }
    fields = BASIC;
    first = await discover(username, fields);
  }

  // newest first, page by page, until past the start of the earlier period
  const profile = first.business_discovery;
  const posts: Media[] = [...(profile.media?.data ?? [])];
  let after = profile.media?.paging?.cursors?.after;
  while (after && posts.length < 400 && (posts.at(-1)?.timestamp.slice(0, 10) ?? "") >= prev.from) {
    const page = (await discover(username, fields, after)).business_discovery.media;
    posts.push(...(page?.data ?? []));
    after = page?.paging?.cursors?.after;
  }

  const day = (m: Media) => m.timestamp.slice(0, 10);
  const inRange = posts.filter((m) => day(m) >= from && day(m) <= to);
  const before = posts.filter((m) => day(m) >= prev.from && day(m) <= prev.to);
  const followers = profile.followers_count ?? null;
  const hasViews = fields === FULL && posts.some((m) => m.view_count !== undefined);

  const sum = (list: Media[], k: "like_count" | "comments_count" | "view_count") => list.reduce((n, m) => n + (m[k] ?? 0), 0);
  const reels = (list: Media[]) => list.filter((m) => m.media_product_type === "REELS" || m.media_type === "VIDEO");
  const avgViews = (list: Media[]) => (reels(list).length ? sum(reels(list), "view_count") / reels(list).length : null);
  // the usual public measure: likes and comments per post, against followers
  const engagement = (list: Media[]) =>
    followers && list.length ? (sum(list, "like_count") + sum(list, "comments_count")) / list.length / followers : null;

  const rows: ContentRow[] = inRange.map((m) => ({
    id: m.id,
    title: (m.caption ?? "").split("\n")[0].slice(0, 120) || "(no caption)",
    url: m.permalink ?? `https://www.instagram.com/${username}/`,
    thumbnail: m.thumbnail_url ?? (m.media_type === "IMAGE" || m.media_type === "CAROUSEL_ALBUM" ? (m.media_url ?? null) : null),
    published: day(m),
    kind: m.media_product_type === "REELS" ? "Reel" : (KIND[m.media_type ?? ""] ?? "Post"),
    stats: {
      views: hasViews ? (m.view_count ?? null) : null,
      likes: m.like_count ?? null,
      comments: m.comments_count ?? null,
      engagement: followers ? ((m.like_count ?? 0) + (m.comments_count ?? 0)) / followers : null,
    },
  }));

  const byDay = new Map<string, number>();
  for (const r of rows) byDay.set(r.published, (byDay.get(r.published) ?? 0) + (hasViews ? (r.stats.views ?? 0) : (r.stats.likes ?? 0)));

  return {
    platform: "instagram",
    account: {
      name: `@${profile.username}`,
      image: profile.profile_picture_url ?? null,
      url: `https://www.instagram.com/${profile.username}/`,
      followers,
    },
    from,
    to,
    fetchedAt: new Date().toISOString(),
    metrics: [
      hasViews
        ? { key: "views", label: "Views", value: sum(inRange, "view_count"), previous: sum(before, "view_count"), format: "count", hint: "On the posts published in this range, to date" }
        : { key: "views", label: "Views", value: null, format: "count", hint: "Instagram didn't share view counts for this account" },
      { key: "avgReel", label: "Avg views per reel", value: hasViews ? avgViews(inRange) : null, previous: hasViews ? avgViews(before) : null, format: "count" },
      { key: "engagement", label: "Engagement rate", value: engagement(inRange), previous: engagement(before), format: "percent", hint: "Likes and comments per post, against followers" },
      { key: "posts", label: "Posts published", value: inRange.length, previous: before.length, format: "count" },
      { key: "likes", label: "Likes", value: sum(inRange, "like_count"), previous: sum(before, "like_count"), format: "count" },
      { key: "comments", label: "Comments", value: sum(inRange, "comments_count"), previous: sum(before, "comments_count"), format: "count" },
      { key: "followers", label: "Followers", value: followers, format: "count", hint: "The account's total now" },
      { key: "allPosts", label: "Posts, all time", value: profile.media_count ?? null, format: "count" },
    ],
    series: daysBetween(from, to).map((d) => ({ day: d, value: byDay.get(d) ?? 0 })),
    seriesLabel: hasViews ? "Views, by the day each post went up" : "Likes, by the day each post went up",
    columns: [
      ...(hasViews ? [{ key: "views", label: "Views", format: "count" as const }] : []),
      { key: "likes", label: "Likes", format: "count" },
      { key: "comments", label: "Comments", format: "count" },
      { key: "engagement", label: "Engagement", format: "percent" },
    ],
    rows,
    notes: [
      "Public numbers: each post's views, likes and comments so far, for the posts published in the range — compared with the ones published in the same length of time before.",
      "Reach, saves, shares and watch time are private to the account, so they aren't here.",
      ...(posts.length >= 400 ? ["Only the latest 400 posts are looked at."] : []),
    ],
  };
}
