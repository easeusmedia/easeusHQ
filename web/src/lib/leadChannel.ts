import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.ts";
import { startRun } from "./apify.ts";
import { callbackKey, IG_ACTOR, YT_ACTOR } from "./contentSync.ts";
import { channelOf, instagramOf, smallAvatar, statsOf, type ChannelStats } from "./channelStats.ts";

// A Sales lead's own channel, read by Apify (Abhishek, 17 Oct 2026): its
// followers, the views it usually gets and its latest uploads, for the lead
// window to draw. Credit is spent sparingly:
// - only when someone opens the lead and its numbers are over a day old,
//   never as a sweep (445 doctor leads must never all read at once);
// - at most one read per lead a day, even if that read fails;
// - the smallest read that answers it: a channel's 10 latest videos, or an
//   Instagram profile with the posts that come with it, in one call;
// - on the live site only (startRun refuses anywhere else).
// The run reports back through the analytics call-back (/api/analytics/
// collect), which hands lead runs here (lib/contentSync.ts collect).

export type { ChannelStats };

const DAY = 24 * 60 * 60 * 1000;
// the board fields a read fills in, by platform (scripts/doctors-setup.ts)
const FIELDS = {
  youtube: { followers: "Subscribers", views: "Typical views" },
  instagram: { followers: "Followers", views: "Usual views" },
} as const;

// Opening a lead: its numbers as they stand, and a read started in the
// background when they're over a day old and none has run today
export async function freshenLeadChannel(leadId: string, origin?: string): Promise<{ channel: ChannelStats | null; channelAt: Date | null; reading: boolean }> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, values: true, channel: true, channelAt: true, board: { select: { fields: { select: { id: true, kind: true } } } } },
  });
  if (!lead) return { channel: null, channelAt: null, reading: false };
  const values = lead.values as Record<string, unknown>;
  const instagram = instagramOf(values, lead.board.fields);
  const target = channelOf(values, lead.board.fields) ?? (instagram ? { platform: "instagram" as const, url: instagram } : null);
  const channel = target?.platform === "youtube" ? await withYoutubePicture(leadId, (lead.channel as ChannelStats | null) ?? null, target.url) : ((lead.channel as ChannelStats | null) ?? null);
  const now = { channel, channelAt: lead.channelAt };
  if (lead.channelAt && Date.now() - lead.channelAt.getTime() < DAY) return { ...now, reading: false };
  if (!target) return { ...now, reading: false };
  // one read a day, whatever came of it
  const today = await prisma.scrapeRun.findFirst({
    where: { kind: "lead", startedAt: { gt: new Date(Date.now() - DAY) }, targets: { path: ["lead"], equals: leadId } },
    select: { status: true },
  });
  if (today) return { ...now, reading: today.status === "RUNNING" || today.status === "SAVING" };
  const callback = origin && !/localhost|127\.0\.0\.1/.test(origin) ? `${origin}/api/analytics/collect?key=${await callbackKey()}` : undefined;
  try {
    const run =
      target.platform === "youtube"
        ? await startRun(YT_ACTOR, { startUrls: [{ url: target.url }], maxResults: 10, maxResultsShorts: 0, maxResultStreams: 0, sortVideosBy: "NEWEST" }, callback)
        : await startRun(IG_ACTOR, { directUrls: [target.url], resultsType: "details", resultsLimit: 1 }, callback);
    await prisma.scrapeRun.create({ data: { id: run.id, platform: target.platform, kind: "lead", account: run.account, targets: { lead: leadId, url: target.url }, since: new Date() } });
    // a YouTube lead's Instagram too, for its picture alone: the lightest
    // read there is (the profile, one result), on the same once-a-day rule
    if (target.platform === "youtube" && instagram) {
      const pic = await startRun(IG_ACTOR, { directUrls: [instagram], resultsType: "details", resultsLimit: 1 }, callback).catch(() => null);
      if (pic) await prisma.scrapeRun.create({ data: { id: pic.id, platform: "instagram", kind: "lead", account: pic.account, targets: { lead: leadId, url: instagram, role: "avatar" }, since: new Date() } });
    }
    return { ...now, reading: true };
  } catch {
    // not the live site, no token, no credit: the numbers stay as they are
    return { ...now, reading: false };
  }
}

// A finished lead read (lib/contentSync.ts collect): its numbers onto the
// lead, and into the board's Subscribers and Typical views (Followers and
// Usual views) as text, the way the board writes numbers
export async function saveLeadRun(run: { platform: string; targets: unknown }, items: unknown[]): Promise<void> {
  const { lead: leadId, role } = run.targets as { lead?: string; role?: string };
  const platform = run.platform === "instagram" ? "instagram" : "youtube";
  if (!leadId) return;
  const stats = statsOf(platform, items);
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { values: true, channel: true, board: { select: { fields: { select: { id: true, name: true } } } } } });
  if (!lead) return;
  const old = (lead.channel as ChannelStats | null) ?? null;
  // the picture itself, fetched once per read and kept small (its link
  // expires), beside the other platforms' pictures already saved
  const picture = stats?.avatar ? await dataUrlOf(stats.avatar) : null;
  const avatars = { ...(old?.avatars ?? {}), ...(picture ? { [platform]: picture } : {}) };
  // ponytail: two reads of one lead can land together and the later save wins
  // the other's picture; the next day's read brings it back
  if (role === "avatar") {
    if (!picture) return;
    const channel: ChannelStats = old
      ? { ...old, avatars, avatar: old.avatar ?? picture }
      : { platform, followers: null, typicalViews: null, recent: [], lastUploadAt: null, avatar: picture, avatars };
    await prisma.lead.update({ where: { id: leadId }, data: { channel } });
    return;
  }
  if (!stats) {
    await prisma.lead.update({ where: { id: leadId }, data: { channelAt: new Date() } });
    return;
  }
  const channel: ChannelStats = { ...stats, avatars, avatar: avatars[platform] ?? Object.values(avatars)[0] ?? null };
  const values = { ...(lead.values as Record<string, unknown>) };
  const field = (name: string) => lead.board.fields.find((f) => f.name.toLowerCase() === name.toLowerCase());
  const names = FIELDS[platform];
  const followers = field(names.followers);
  const views = field(names.views);
  if (followers && stats.followers !== null) values[followers.id] = stats.followers.toLocaleString("en-GB");
  if (views && stats.typicalViews !== null) values[views.id] = stats.typicalViews.toLocaleString("en-GB");
  await prisma.lead.update({ where: { id: leadId }, data: { channel, channelAt: new Date(), values: values as Prisma.InputJsonObject } });
}

// The channel's picture from its own YouTube page (Abhishek, 19 Oct 2026:
// "fetch the YouTube profile picture"): free and on any site, not an Apify
// read, so the lead window shows it on localhost too. Kept as its link
// (YouTube's picture links last), so no image travels with the lead. Looked
// for once; a page without one isn't asked again that day.
async function withYoutubePicture(leadId: string, channel: ChannelStats | null, url: string): Promise<ChannelStats | null> {
  if (channel?.avatars?.youtube) return channel;
  if (channel?.pictureTriedAt && Date.now() - Date.parse(channel.pictureTriedAt) < DAY) return channel;
  const pic = await youtubePicture(url);
  const base: ChannelStats = channel ?? { platform: "youtube", followers: null, typicalViews: null, recent: [], lastUploadAt: null, avatar: null };
  const next: ChannelStats = pic ? { ...base, avatars: { ...(base.avatars ?? {}), youtube: pic }, avatar: base.avatar ?? pic, pictureTriedAt: undefined } : { ...base, pictureTriedAt: new Date().toISOString() };
  await prisma.lead.update({ where: { id: leadId }, data: { channel: next as unknown as Prisma.InputJsonObject } }).catch(() => {});
  return next;
}

// The picture a YouTube channel's page shares (its og:image), at 128px; only
// ever an address on YouTube's own picture host
export async function youtubePicture(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36", "accept-language": "en-GB,en;q=0.9" }, signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const html = await res.text();
    const src = (/<meta property="og:image" content="([^"]+)"/.exec(html) ?? /<link rel="image_src" href="([^"]+)"/.exec(html))?.[1];
    return src && /^https:\/\/yt\d+\.(googleusercontent|ggpht)\.com\/[^\s"'<>]+$/.test(src) ? smallAvatar(src) : null;
  } catch {
    return null;
  }
}

// A picture as a data URL, or null: an image only, at most 200 KB, given 10
// seconds
async function dataUrlOf(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > 200_000) return null;
    return `data:${type.split(";")[0]};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}
