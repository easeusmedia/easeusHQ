import { daysBetween, previousRange, youtubeRef, type ContentRow, type Dashboard } from "./analytics.ts";
import { scraped } from "./apify.ts";

// Any client's YouTube channel, from what's public on it — subscribers, and
// every video's views, likes and comments — scraped by Apify's YouTube
// Scraper (see lib/apify.ts for the tokens, the background runs and the
// caching). No Google account involved. About $0.005 per video read.
//
// What's public can't show impressions, click-through rate, watch time or
// retention — YouTube keeps those for the channel's own managers.

const ACTOR = "streamers~youtube-scraper";

export type Video = {
  id: string;
  title?: string;
  type?: string; // video, shorts, stream
  url?: string;
  thumbnailUrl?: string;
  viewCount?: number;
  likes?: number;
  commentsCount?: number;
  date?: string; // ISO
  duration?: string; // 00:04:19
  channelName?: string;
  channelUrl?: string;
  channelAvatarUrl?: string;
  numberOfSubscribers?: number;
  channelTotalViews?: number;
  channelTotalVideos?: number;
};

// the channel's own address, from however it was pasted
export function channelUrl(input: string): string | null {
  const ref = youtubeRef(input);
  if (!ref) return null;
  if ("id" in ref) return `https://www.youtube.com/channel/${ref.id}`;
  if ("handle" in ref) return `https://www.youtube.com/@${ref.handle}`;
  return `https://www.youtube.com/user/${ref.username}`;
}

// The channel's videos and Shorts back to `since`
export async function youtubeData(
  clientId: string,
  url: string,
  since: string,
  refresh: boolean
): Promise<{ pending: true } | { videos: Video[]; fetchedAt: string }> {
  const got = await scraped<Video>(clientId, `yt:${url}`, since, refresh, ACTOR, {
    videos: {
      startUrls: [{ url }],
      maxResults: 200,
      maxResultsShorts: 200,
      maxResultStreams: 0,
      oldestPostDate: since,
      sortVideosBy: "NEWEST",
    },
  });
  if ("pending" in got) return got;
  return { videos: got.results.videos ?? [], fetchedAt: got.fetchedAt };
}

const seconds = (d?: string) => (d ?? "").split(":").reduce((n, part) => n * 60 + (Number(part) || 0), 0);

// The dashboard from a scrape. Pure, so it can be tested on its own.
export function youtubeDashboard(url: string, videos: Video[], fetchedAt: string, from: string, to: string): Dashboard {
  const prev = previousRange(from, to);
  const day = (v: Video) => (v.date ?? "").slice(0, 10);
  const inRange = videos.filter((v) => day(v) >= from && day(v) <= to);
  const before = videos.filter((v) => day(v) >= prev.from && day(v) <= prev.to);
  const channel = videos[0];

  const sum = (list: Video[], k: "viewCount" | "likes" | "commentsCount") => list.reduce((n, v) => n + (v[k] ?? 0), 0);
  const avg = (list: Video[]) => (list.length ? sum(list, "viewCount") / list.length : null);
  const engagement = (list: Video[]) => {
    const views = sum(list, "viewCount");
    return views ? (sum(list, "likes") + sum(list, "commentsCount")) / views : null;
  };

  const rows: ContentRow[] = inRange.map((v) => ({
    id: v.id,
    title: v.title ?? "(untitled)",
    url: v.url ?? `https://www.youtube.com/watch?v=${v.id}`,
    thumbnail: v.thumbnailUrl ?? null,
    published: day(v),
    // Shorts can run to three minutes now
    kind: v.type === "shorts" || (v.type !== "video" && seconds(v.duration) <= 180) ? "Short" : "Video",
    stats: {
      views: v.viewCount ?? null,
      likes: v.likes ?? null,
      comments: v.commentsCount ?? null,
      engagement: v.viewCount ? ((v.likes ?? 0) + (v.commentsCount ?? 0)) / v.viewCount : null,
    },
  }));

  const byDay = new Map<string, number>();
  for (const r of rows) byDay.set(r.published, (byDay.get(r.published) ?? 0) + (r.stats.views ?? 0));

  return {
    platform: "youtube",
    account: {
      name: channel?.channelName ?? url.replace(/^https:\/\/www\.youtube\.com\//, ""),
      image: channel?.channelAvatarUrl ?? null,
      url,
      followers: channel?.numberOfSubscribers ?? null,
    },
    from,
    to,
    fetchedAt,
    metrics: [
      { key: "views", label: "Views", value: sum(inRange, "viewCount"), previous: sum(before, "viewCount"), format: "count", hint: "On the videos published in this range, to date" },
      { key: "avgViews", label: "Avg views per video", value: avg(inRange), previous: avg(before), format: "count" },
      { key: "engagement", label: "Engagement rate", value: engagement(inRange), previous: engagement(before), format: "percent", hint: "Likes and comments per view" },
      { key: "videos", label: "Videos published", value: inRange.length, previous: before.length, format: "count" },
      { key: "likes", label: "Likes", value: sum(inRange, "likes"), previous: sum(before, "likes"), format: "count" },
      { key: "comments", label: "Comments", value: sum(inRange, "commentsCount"), previous: sum(before, "commentsCount"), format: "count" },
      { key: "subscribers", label: "Subscribers", value: channel?.numberOfSubscribers ?? null, format: "count", hint: "The channel's total now" },
      { key: "channelViews", label: "Channel views, all time", value: channel?.channelTotalViews ?? null, format: "count" },
    ],
    series: daysBetween(from, to).map((d) => ({ day: d, value: byDay.get(d) ?? 0 })),
    seriesLabel: "Views, by the day each video went up",
    columns: [
      { key: "views", label: "Views", format: "count" },
      { key: "likes", label: "Likes", format: "count" },
      { key: "comments", label: "Comments", format: "count" },
      { key: "engagement", label: "Engagement", format: "percent" },
    ],
    rows,
    notes: [
      "Public numbers: each video's views, likes and comments so far, for the videos published in the range — compared with the ones published in the same length of time before.",
      "Impressions, click-through rate and watch time are private to the channel, so they aren't here.",
    ],
  };
}
