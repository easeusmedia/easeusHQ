import { randomBytes } from "crypto";
import { prisma } from "./prisma.ts";
import { runResult, startRun } from "./apify.ts";
import { instagramUsername, shiftDay, socialLink, youtubeRef, type Platform } from "./analytics.ts";

// Keeping every client's public YouTube and Instagram numbers in our own
// database, so any analytics view opens instantly and Apify is paid for as
// little scraping as possible.
//
// How it stays cheap:
//   - One run per platform covers every client at once (a scrape's cost is
//     per video or post read, not per run, but one run is one start-up).
//   - Once a day, only what's recent is read again — the last 8 days, when a
//     post's views are still climbing. On Mondays the window is 21 days, so
//     last week's numbers are settled and anything a missed day skipped is
//     caught. Older posts keep the count they had when last read.
//   - A range further back than anything read so far (say, a client's last
//     90 days, the first time) is read once, then kept.
//   - Opening a page never scrapes if the numbers are already here.
//
// Runs happen on Apify in the background; Apify calls back when one's done
// (/api/analytics/collect), and anyone opening analytics also collects any
// run that has finished, in case a call-back was missed.

export const IG_ACTOR = "apify~instagram-scraper";
export const YT_ACTOR = "streamers~youtube-scraper";
const DAILY_WINDOW = 8;
const WEEKLY_WINDOW = 21;
// a run older than this that never reported back is given up on
const LOST_MS = 30 * 60 * 1000;

export type Target = { clientId: string; platform: Platform; handle: string };

// the address a channel is scraped at, from however it was pasted
export function channelUrl(input: string): string | null {
  const ref = youtubeRef(input);
  if (!ref) return null;
  if ("id" in ref) return `https://www.youtube.com/channel/${ref.id}`;
  if ("handle" in ref) return `https://www.youtube.com/@${ref.handle}`;
  return `https://www.youtube.com/user/${ref.username}`;
}

// how an address is matched back to its client when results come in
export const addressKey = (url: string) =>
  url
    .toLowerCase()
    .split(/[?#]/)[0]
    .replace(/\/(videos|shorts|streams|featured)$/, "")
    .replace(/\/+$/, "")
    .replace("://youtube.com", "://www.youtube.com");

// Every client account there's a link for — only the ones someone gave
export async function targets(clientIds?: string[]): Promise<Target[]> {
  const clients = await prisma.client.findMany({
    where: clientIds ? { id: { in: clientIds } } : {},
    select: { id: true, youtubeChannel: true, instagramHandle: true, socialLinks: true },
  });
  return clients.flatMap((c) => {
    const yt = channelUrl(c.youtubeChannel ?? socialLink(c.socialLinks, "youtube.com") ?? "");
    const ig = instagramUsername(c.instagramHandle ?? socialLink(c.socialLinks, "instagram.com"));
    return [
      ...(yt ? [{ clientId: c.id, platform: "youtube" as const, handle: yt }] : []),
      ...(ig ? [{ clientId: c.id, platform: "instagram" as const, handle: ig }] : []),
    ];
  });
}

// the secret in the call-back address, so only Apify's call-backs are taken
async function callbackKey(): Promise<string> {
  const key = "analytics.callbackKey";
  const found = await prisma.appSetting.findUnique({ where: { key } });
  if (found) return found.value;
  const value = randomBytes(24).toString("hex");
  await prisma.appSetting.create({ data: { key, value } });
  return value;
}

export async function callbackKeyMatches(value: string | null): Promise<boolean> {
  const found = await prisma.appSetting.findUnique({ where: { key: "analytics.callbackKey" } });
  return !!found && !!value && found.value === value;
}

// Starts whatever runs are needed to read these accounts back to `since` —
// skipping any account a run already under way covers.
export async function startSync(opts: {
  clientIds?: string[];
  platforms?: Platform[];
  since: string; // yyyy-mm-dd
  origin?: string;
}): Promise<{ started: number }> {
  const list = (await targets(opts.clientIds)).filter((t) => !opts.platforms || opts.platforms.includes(t.platform));
  if (!list.length) return { started: 0 };
  const since = new Date(`${opts.since}T00:00:00Z`);
  const running = await prisma.scrapeRun.findMany({ where: { status: "RUNNING" } });
  const covered = (t: Target, kind: string) =>
    running.some(
      (r) =>
        r.platform === t.platform &&
        r.kind === kind &&
        r.since <= since &&
        Object.prototype.hasOwnProperty.call(r.targets as Record<string, string>, t.platform === "youtube" ? addressKey(t.handle) : t.handle)
    );
  const callback =
    opts.origin && !/localhost|127\.0\.0\.1/.test(opts.origin)
      ? `${opts.origin}/api/analytics/collect?key=${await callbackKey()}`
      : undefined;

  const record = async (platform: Platform, kind: string, run: { id: string; account: string }, map: Record<string, string>) =>
    prisma.scrapeRun.create({ data: { id: run.id, platform, kind, account: run.account, targets: map, since } });

  let started = 0;
  const ig = list.filter((t) => t.platform === "instagram");
  const igPosts = ig.filter((t) => !covered(t, "posts"));
  if (igPosts.length) {
    const urls = igPosts.map((t) => `https://www.instagram.com/${t.handle}/`);
    const map = Object.fromEntries(igPosts.map((t) => [t.handle, t.clientId]));
    await record(
      "instagram",
      "posts",
      await startRun(IG_ACTOR, { directUrls: urls, resultsType: "posts", resultsLimit: 100, onlyPostsNewerThan: opts.since, addParentData: false }, callback),
      map
    );
    // followers and post count ride along, one result per account
    await record("instagram", "details", await startRun(IG_ACTOR, { directUrls: urls, resultsType: "details", resultsLimit: 1 }, callback), map);
    started += 2;
  }
  const yt = list.filter((t) => t.platform === "youtube" && !covered(t, "videos"));
  if (yt.length) {
    await record(
      "youtube",
      "videos",
      await startRun(
        YT_ACTOR,
        {
          startUrls: yt.map((t) => ({ url: t.handle })),
          maxResults: 60,
          maxResultsShorts: 60,
          maxResultStreams: 0,
          oldestPostDate: opts.since,
          sortVideosBy: "NEWEST",
        },
        callback
      ),
      Object.fromEntries(yt.map((t) => [addressKey(t.handle), t.clientId]))
    );
    started += 1;
  }
  return { started };
}

// The daily refresh (/api/cron/analytics). At most once every 20 hours,
// whoever calls it and however often.
export async function dailySync(origin?: string): Promise<{ started: number; skipped?: string }> {
  const key = "analytics.lastDaily";
  const last = await prisma.appSetting.findUnique({ where: { key } });
  if (last && Date.now() - Date.parse(last.value) < 20 * 60 * 60 * 1000) return { started: 0, skipped: "already ran today" };
  await prisma.appSetting.upsert({ where: { key }, create: { key, value: new Date().toISOString() }, update: { value: new Date().toISOString() } });
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Kolkata" });
  const monday = new Date(`${today}T00:00:00Z`).getUTCDay() === 1;
  return startSync({ since: shiftDay(today, -(monday ? WEEKLY_WINDOW : DAILY_WINDOW)), origin });
}

// ---- turning scraped items into rows ----

type IgItem = {
  id: string;
  type?: string;
  productType?: string;
  url?: string;
  caption?: string;
  timestamp?: string;
  likesCount?: number;
  commentsCount?: number;
  videoPlayCount?: number;
  videoViewCount?: number;
  displayUrl?: string;
  ownerUsername?: string;
  // details
  username?: string;
  fullName?: string;
  followersCount?: number;
  postsCount?: number;
  profilePicUrl?: string;
};

type YtItem = {
  id: string;
  title?: string;
  type?: string;
  url?: string;
  thumbnailUrl?: string;
  viewCount?: number;
  likes?: number;
  commentsCount?: number;
  date?: string;
  duration?: string;
  channelName?: string;
  channelUrl?: string;
  channelUsername?: string;
  inputChannelUrl?: string;
  fromYTUrl?: string;
  channelAvatarUrl?: string;
  numberOfSubscribers?: number;
  channelTotalViews?: number;
  channelTotalVideos?: number;
};

export type Row = {
  externalId: string;
  title: string;
  url: string;
  thumbnail: string | null;
  kind: string;
  publishedAt: Date;
  views: number | null;
  likes: number | null;
  comments: number | null;
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);

export function igRow(p: IgItem): Row | null {
  if (!p.id || !p.timestamp) return null;
  return {
    externalId: p.id,
    title: (p.caption ?? "").split("\n")[0].slice(0, 200) || "(no caption)",
    url: p.url ?? "",
    // through our own server: Instagram's image host won't serve other sites
    thumbnail: p.displayUrl ? `/api/analytics/thumb?u=${encodeURIComponent(p.displayUrl)}` : null,
    kind: p.productType === "clips" ? "Reel" : p.type === "Sidecar" ? "Carousel" : p.type === "Video" ? "Video" : "Post",
    publishedAt: new Date(p.timestamp),
    // what Instagram itself shows as a reel's views
    views: p.type === "Video" ? num(p.videoPlayCount ?? p.videoViewCount) : null,
    likes: num(p.likesCount),
    comments: num(p.commentsCount),
  };
}

const seconds = (d?: string) => (d ?? "").split(":").reduce((n, part) => n * 60 + (Number(part) || 0), 0);

export function ytRow(v: YtItem): Row | null {
  if (!v.id || !v.date) return null;
  return {
    externalId: v.id,
    title: v.title ?? "(untitled)",
    url: v.url ?? `https://www.youtube.com/watch?v=${v.id}`,
    thumbnail: v.thumbnailUrl ?? null,
    // Shorts can run to three minutes now
    kind: v.type === "shorts" || (v.type !== "video" && seconds(v.duration) <= 180) ? "Short" : "Video",
    publishedAt: new Date(v.date),
    views: num(v.viewCount),
    likes: num(v.likes),
    comments: num(v.commentsCount),
  };
}

// which of a run's clients a YouTube result belongs to
export function ytClient(v: YtItem, map: Record<string, string>): string | undefined {
  const candidates = [v.inputChannelUrl, v.fromYTUrl, v.channelUrl, v.channelUsername && `https://www.youtube.com/@${v.channelUsername}`];
  for (const c of candidates) if (c && map[addressKey(c)]) return map[addressKey(c)];
  // a run for one channel can only be that channel's
  const ids = Object.values(map);
  return ids.length === 1 ? ids[0] : undefined;
}

async function saveRows(clientId: string, platform: Platform, rows: Row[], at: Date) {
  // a batch at a time — a first read can be a couple of hundred posts
  for (let i = 0; i < rows.length; i += 50) {
    await prisma.$transaction(
      rows.slice(i, i + 50).map((r) =>
        prisma.contentItem.upsert({
          where: { platform_externalId: { platform, externalId: r.externalId } },
          create: { clientId, platform, ...r, scrapedAt: at },
          update: { clientId, title: r.title, url: r.url, thumbnail: r.thumbnail, kind: r.kind, views: r.views, likes: r.likes, comments: r.comments, scrapedAt: at },
        })
      )
    );
  }
}

async function saveAccount(clientId: string, platform: Platform, handle: string, data: Partial<{ name: string; image: string | null; followers: number | null; totalViews: number | null; totalPosts: number | null; coveredSince: Date }>) {
  const existing = await prisma.socialAccount.findUnique({ where: { clientId_platform: { clientId, platform } } });
  const coveredSince =
    data.coveredSince && existing?.coveredSince && existing.handle === handle
      ? new Date(Math.min(existing.coveredSince.getTime(), data.coveredSince.getTime()))
      : (data.coveredSince ?? (existing?.handle === handle ? existing?.coveredSince : null) ?? null);
  const fields = { handle, ...data, coveredSince, scrapedAt: new Date() };
  await prisma.socialAccount.upsert({
    where: { clientId_platform: { clientId, platform } },
    create: { clientId, platform, ...fields },
    update: fields,
  });
}

// Collects every run that has finished — its results into the database.
// Cheap when nothing's pending (one query); throttled per run.
export async function collect(): Promise<{ pending: number }> {
  const runs = await prisma.scrapeRun.findMany({ where: { status: "RUNNING" } });
  let pending = 0;
  for (const run of runs) {
    if (run.checkedAt && Date.now() - run.checkedAt.getTime() < 10_000) {
      pending++;
      continue;
    }
    const lost = Date.now() - run.startedAt.getTime() > LOST_MS;
    let res: { status: string; items?: unknown[] };
    try {
      res = await runResult(run.id, run.account);
    } catch {
      res = { status: lost ? "LOST" : "RUNNING" };
    }
    if (res.status !== "SUCCEEDED") {
      const finished = ["FAILED", "ABORTED", "TIMED-OUT", "LOST"].includes(res.status) || lost;
      await prisma.scrapeRun.update({
        where: { id: run.id },
        data: finished ? { status: lost ? "LOST" : res.status, doneAt: new Date(), checkedAt: new Date() } : { checkedAt: new Date() },
      });
      if (!finished) pending++;
      continue;
    }
    // claim it, so a call-back and a page load can't both save it
    const claimed = await prisma.scrapeRun.updateMany({ where: { id: run.id, status: "RUNNING" }, data: { status: "SAVING" } });
    if (!claimed.count) continue;
    const map = run.targets as Record<string, string>;
    const at = new Date();
    if (run.platform === "instagram" && run.kind === "posts") {
      const items = res.items as IgItem[];
      for (const [handle, clientId] of Object.entries(map)) {
        const rows = items.filter((p) => p.ownerUsername?.toLowerCase() === handle).flatMap((p) => igRow(p) ?? []);
        await saveRows(clientId, "instagram", rows, at);
        await saveAccount(clientId, "instagram", handle, { coveredSince: run.since });
      }
    } else if (run.platform === "instagram" && run.kind === "details") {
      for (const d of res.items as IgItem[]) {
        const handle = d.username?.toLowerCase();
        const clientId = handle && map[handle];
        if (!clientId) continue;
        await saveAccount(clientId, "instagram", handle, {
          name: d.fullName ? `${d.fullName} · @${handle}` : `@${handle}`,
          image: d.profilePicUrl ? `/api/analytics/thumb?u=${encodeURIComponent(d.profilePicUrl)}` : null,
          followers: num(d.followersCount),
          totalPosts: num(d.postsCount),
        });
      }
    } else if (run.platform === "youtube") {
      const items = res.items as YtItem[];
      const byClient = new Map<string, YtItem[]>();
      for (const v of items) {
        const clientId = ytClient(v, map);
        if (clientId) byClient.set(clientId, [...(byClient.get(clientId) ?? []), v]);
      }
      for (const [address, clientId] of Object.entries(map)) {
        const list = byClient.get(clientId) ?? [];
        await saveRows(clientId, "youtube", list.flatMap((v) => ytRow(v) ?? []), at);
        const c = list[0];
        await saveAccount(clientId, "youtube", address, {
          coveredSince: run.since,
          ...(c
            ? {
                name: c.channelName,
                image: c.channelAvatarUrl ?? null,
                followers: num(c.numberOfSubscribers),
                totalViews: num(c.channelTotalViews),
                totalPosts: num(c.channelTotalVideos),
              }
            : {}),
        });
      }
    }
    await prisma.scrapeRun.update({ where: { id: run.id }, data: { status: "SUCCEEDED", doneAt: new Date(), checkedAt: new Date() } });
  }
  // the record of finished runs is only needed for a while
  await prisma.scrapeRun.deleteMany({ where: { doneAt: { lt: new Date(Date.now() - 7 * 86_400_000) } } });
  return { pending };
}

// Whether a run covering this account is under way
export async function syncing(clientId: string, platform: Platform): Promise<boolean> {
  const runs = await prisma.scrapeRun.findMany({ where: { status: { in: ["RUNNING", "SAVING"] }, platform } });
  return runs.some((r) => Object.values(r.targets as Record<string, string>).includes(clientId));
}
