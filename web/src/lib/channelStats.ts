import type { LinkValue } from "./space.ts";

// The numbers a Sales lead's channel shows (lib/leadChannel.ts reads them
// with Apify): kept apart so they can be checked without a database.

export type ChannelStats = {
  platform: "youtube" | "instagram";
  followers: number | null;
  typicalViews: number | null;
  recent: { title: string; views: number | null; at: string | null; url: string | null }[];
  lastUploadAt: string | null;
  // its profile picture: from a read, the scraper's link; saved on the lead,
  // that picture itself, small, as a data URL (the links expire)
  avatar: string | null;
};

// the lead's channel, from its Links: the "YouTube channel" link, or the
// "Instagram" one; failing those, any link to a channel or a profile
export function channelOf(values: Record<string, unknown>, fields: { id: string; kind: string }[]): { platform: ChannelStats["platform"]; url: string } | null {
  const links = fields.filter((f) => f.kind === "links").flatMap((f) => (Array.isArray(values[f.id]) ? (values[f.id] as LinkValue[]) : []));
  const yt = links.find((l) => /youtube channel/i.test(l.label)) ?? links.find((l) => /youtube\.com\/(@|channel\/|c\/|user\/)/i.test(l.url));
  if (yt?.url) return { platform: "youtube", url: yt.url.trim() };
  const ig = links.find((l) => /^instagram$/i.test(l.label.trim())) ?? links.find((l) => /instagram\.com\/[^/]+\/?$/i.test(l.url));
  if (ig?.url) return { platform: "instagram", url: ig.url.trim() };
  return null;
}

// the middle of a list of view counts: what a typical upload gets, not
// thrown by one hit
export function median(ns: number[]): number | null {
  if (!ns.length) return null;
  const s = [...ns].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

type YtItem = { title?: string; url?: string; viewCount?: number; date?: string; numberOfSubscribers?: number; channelAvatarUrl?: string };
type IgPost = { caption?: string; url?: string; timestamp?: string; type?: string; videoPlayCount?: number; videoViewCount?: number };
type IgDetails = { followersCount?: number; latestPosts?: IgPost[]; profilePicUrl?: string; profilePicUrlHD?: string };

// a YouTube avatar at 128px: its address carries the size ("=s900-c-k…")
export const smallAvatar = (url: string) => url.replace(/=s\d+(-|$)/, "=s128$1");

// what a finished read says, in the one shape the window draws
export function statsOf(platform: ChannelStats["platform"], items: unknown[]): ChannelStats | null {
  if (platform === "youtube") {
    const videos = (items as YtItem[]).filter((v) => v.url);
    if (!videos.length) return null;
    const recent = videos
      .map((v) => ({ title: v.title ?? "", views: v.viewCount ?? null, at: v.date ?? null, url: v.url ?? null }))
      .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
    return {
      platform,
      followers: videos.find((v) => typeof v.numberOfSubscribers === "number")?.numberOfSubscribers ?? null,
      typicalViews: median(recent.flatMap((v) => (typeof v.views === "number" ? [v.views] : []))),
      recent: recent.slice(0, 10),
      lastUploadAt: recent[0]?.at ?? null,
      avatar: ((a) => (a ? smallAvatar(a) : null))(videos.find((v) => v.channelAvatarUrl)?.channelAvatarUrl),
    };
  }
  const d = (items as IgDetails[])[0];
  if (!d) return null;
  const posts = (d.latestPosts ?? [])
    .map((p) => ({ title: (p.caption ?? "").split("\n")[0].slice(0, 90), views: p.videoPlayCount ?? p.videoViewCount ?? null, at: p.timestamp ?? null, url: p.url ?? null }))
    .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  return {
    platform,
    followers: d.followersCount ?? null,
    // views are a video's: the reels among the latest posts
    typicalViews: median(posts.flatMap((p) => (typeof p.views === "number" ? [p.views] : []))),
    recent: posts.slice(0, 10),
    lastUploadAt: posts[0]?.at ?? null,
    // the standard one is already small (about 150px); the HD one only if it's missing
    avatar: d.profilePicUrl ?? d.profilePicUrlHD ?? null,
  };
}
