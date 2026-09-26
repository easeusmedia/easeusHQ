import { daysBetween, previousRange, type ContentRow, type Dashboard } from "./analytics.ts";
import { scraped } from "./apify.ts";

// Any client's Instagram, from what's public on their profile — followers,
// and every post's views, likes and comments — scraped by Apify's Instagram
// Scraper (see lib/apify.ts for the tokens, the background runs and the
// caching). About $0.0027 per post read.
//
// What's public can't show reach, saves, shares or watch time — Instagram
// keeps those for the account itself.

const ACTOR = "apify~instagram-scraper";

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

// The account's posts back to `since`, and its profile
export async function instagramData(
  clientId: string,
  username: string,
  since: string,
  refresh: boolean
): Promise<{ pending: true } | { posts: Post[]; profile: Profile | null; fetchedAt: string }> {
  const url = `https://www.instagram.com/${username}/`;
  const got = await scraped<Post & Profile>(clientId, `ig:${username}`, since, refresh, ACTOR, {
    posts: { directUrls: [url], resultsType: "posts", resultsLimit: 300, onlyPostsNewerThan: since, addParentData: false },
    details: { directUrls: [url], resultsType: "details", resultsLimit: 1 },
  });
  if ("pending" in got) return got;
  return { posts: got.results.posts ?? [], profile: (got.results.details?.[0] as Profile | undefined) ?? null, fetchedAt: got.fetchedAt };
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
