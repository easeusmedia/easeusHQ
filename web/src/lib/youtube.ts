import type { SocialConnection } from "@prisma/client";
import { prisma } from "./prisma";
import { DRIVE_SETTINGS, driveSettings } from "./drive";
import {
  daysBetween,
  isoSeconds,
  parseReachCsv,
  previousRange,
  sumReach,
  type ContentRow,
  type Dashboard,
} from "./analytics";

// A client's YouTube channel, read with the same Google app the Drive
// connection uses (Integrations → Google Drive) — no second app to set up,
// just three more APIs switched on in its Cloud project: YouTube Data API
// v3, YouTube Analytics API and YouTube Reporting API.
//
//   Data API       the channel, its uploads, titles, thumbnails, lengths
//   Analytics API  views, watch time, retention, likes… for any date range
//   Reporting API  thumbnail impressions and CTR — only available as daily
//                  bulk files, from 30 days before the channel was connected
//                  onward, so they're collected into YoutubeReach as they come
//
// Read-only scopes: nothing is ever posted or changed on the channel.

export const YOUTUBE_SCOPES =
  "https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly";
const REACH_REPORT = "channel_reach_basic_a1";

async function googleApp() {
  const s = await driveSettings();
  const id = s[DRIVE_SETTINGS.clientId];
  const secret = s[DRIVE_SETTINGS.clientSecret];
  if (!id || !secret) throw new Error("The Google app isn't set up yet — add it under Integrations first.");
  return { id, secret };
}

export async function youtubeConsentUrl(origin: string, state: string): Promise<string> {
  const { id } = await googleApp();
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: `${origin}/api/google/callback`,
    response_type: "code",
    access_type: "offline",
    // select_account: the channel is often a brand account, not the
    // personal one the browser is signed in as — Google has to ask
    prompt: "consent select_account",
    scope: YOUTUBE_SCOPES,
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

// Google's error, in words, rather than a status code
async function call<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { ...init?.headers, Authorization: `Bearer ${token}` } });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message: string = body?.error?.message ?? `YouTube answered ${res.status}.`;
    if (/has not been used|is disabled/i.test(message)) {
      throw new Error(`${message.split(".")[0]}. Switch it on in the Google Cloud project, then try again.`);
    }
    throw new Error(message);
  }
  return body as T;
}

// Finishes connecting a channel: the one-time code for a lasting refresh
// token, the channel it opened, and the Reporting job that'll produce its
// impressions and CTR.
export async function connectYoutube(clientId: string, code: string, origin: string): Promise<void> {
  const { id, secret } = await googleApp();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: id,
      client_secret: secret,
      redirect_uri: `${origin}/api/google/callback`,
      grant_type: "authorization_code",
    }),
  });
  const tokens = await res.json();
  if (!res.ok) throw new Error(tokens?.error_description ?? "Google wouldn't complete the connection.");
  if (!tokens.refresh_token) throw new Error("Google didn't return a lasting connection — try again.");

  const channels = await call<{ items?: { id: string; snippet: { title: string; thumbnails?: { default?: { url: string } } } }[] }>(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    tokens.access_token
  );
  const channel = channels.items?.[0];
  if (!channel) {
    throw new Error("That Google account has no YouTube channel. Connect again and pick the channel itself (often a brand account).");
  }
  // without it the dashboard still works, just without impressions and CTR
  const reachJobId = await reachJob(tokens.access_token).catch(() => null);

  const data = {
    accountId: channel.id,
    accountName: channel.snippet.title,
    accountImage: channel.snippet.thumbnails?.default?.url ?? null,
    token: tokens.refresh_token as string,
    reachJobId,
    reachReadUntil: null,
  };
  await prisma.socialConnection.upsert({
    where: { clientId_platform: { clientId, platform: "youtube" } },
    create: { clientId, platform: "youtube", ...data },
    update: data,
  });
  await prisma.youtubeReach.deleteMany({ where: { clientId } });
  await prisma.analyticsCache.deleteMany({ where: { clientId } });
}

// The channel's reach job — reused if one already exists (a reconnect, or
// another tool), else made
async function reachJob(token: string): Promise<string> {
  const base = "https://youtubereporting.googleapis.com/v1/jobs";
  const { jobs = [] } = await call<{ jobs?: { id: string; reportTypeId: string }[] }>(base, token);
  const found = jobs.find((j) => j.reportTypeId === REACH_REPORT);
  if (found) return found.id;
  const made = await call<{ id: string }>(base, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reportTypeId: REACH_REPORT, name: "Easeus HQ — reach" }),
  });
  return made.id;
}

const tokens = new Map<string, { token: string; expires: number }>();

async function accessToken(conn: SocialConnection): Promise<string> {
  const hit = tokens.get(conn.id);
  if (hit && hit.expires > Date.now() + 60_000) return hit.token;
  const { id, secret } = await googleApp();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: conn.token, grant_type: "refresh_token" }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(
      body?.error === "invalid_grant"
        ? "The YouTube connection has lapsed — connect the channel again."
        : (body?.error_description ?? "Google wouldn't refresh the connection.")
    );
  }
  tokens.set(conn.id, { token: body.access_token, expires: Date.now() + body.expires_in * 1000 });
  return body.access_token;
}

// Reads every reach file YouTube has made since the last read. Each covers
// one day; a later one for the same day (a correction) replaces it.
async function collectReach(conn: SocialConnection, token: string) {
  if (!conn.reachJobId) return;
  let newest = conn.reachReadUntil;
  let pageToken: string | undefined;
  do {
    const q = new URLSearchParams({
      ...(conn.reachReadUntil ? { createdAfter: conn.reachReadUntil.toISOString() } : {}),
      ...(pageToken ? { pageToken } : {}),
    });
    const page = await call<{
      reports?: { id: string; createTime: string; downloadUrl: string }[];
      nextPageToken?: string;
    }>(`https://youtubereporting.googleapis.com/v1/jobs/${conn.reachJobId}/reports?${q}`, token);
    for (const report of page.reports ?? []) {
      const csv = await fetch(report.downloadUrl, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.text());
      const rows = parseReachCsv(csv);
      const days = [...new Set(rows.map((r) => r.day))];
      await prisma.$transaction([
        prisma.youtubeReach.deleteMany({ where: { clientId: conn.clientId, day: { in: days } } }),
        prisma.youtubeReach.createMany({ data: rows.map((r) => ({ clientId: conn.clientId, ...r })) }),
      ]);
      const made = new Date(report.createTime);
      if (!newest || made > newest) newest = made;
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  if (newest !== conn.reachReadUntil) {
    await prisma.socialConnection.update({ where: { id: conn.id }, data: { reachReadUntil: newest } });
  }
}

type Row = Record<string, number | string>;

// One Analytics API query, as rows keyed by column name
async function report(token: string, params: Record<string, string>): Promise<Row[]> {
  const q = new URLSearchParams({ ids: "channel==MINE", ...params });
  const body = await call<{ columnHeaders: { name: string }[]; rows?: (number | string)[][] }>(
    `https://youtubeanalytics.googleapis.com/v2/reports?${q}`,
    token
  );
  const cols = body.columnHeaders.map((h) => h.name);
  return (body.rows ?? []).map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i]])));
}

const TOTALS = "views,estimatedMinutesWatched,averageViewDuration,likes,comments,shares,subscribersGained,subscribersLost";
const PER_VIDEO = "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,comments,shares,subscribersGained";

type Video = {
  id: string;
  snippet: { title: string; publishedAt: string; thumbnails?: { medium?: { url: string }; default?: { url: string } } };
  contentDetails: { duration: string };
  statistics?: { viewCount?: string };
};

async function videos(token: string, ids: string[]): Promise<Video[]> {
  const out: Video[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const q = new URLSearchParams({ part: "snippet,contentDetails,statistics", id: ids.slice(i, i + 50).join(",") });
    const { items = [] } = await call<{ items?: Video[] }>(`https://www.googleapis.com/youtube/v3/videos?${q}`, token);
    out.push(...items);
  }
  return out;
}

export async function youtubeDashboard(conn: SocialConnection, from: string, to: string): Promise<Dashboard> {
  const token = await accessToken(conn);
  const prev = previousRange(from, to);

  const [totals, before, daily, perVideo, channel] = await Promise.all([
    report(token, { startDate: from, endDate: to, metrics: TOTALS }),
    report(token, { startDate: prev.from, endDate: prev.to, metrics: TOTALS }),
    report(token, { startDate: from, endDate: to, metrics: "views", dimensions: "day", sort: "day" }),
    report(token, { startDate: from, endDate: to, metrics: PER_VIDEO, dimensions: "video", sort: "-views", maxResults: "50" }),
    call<{ items?: { statistics: { subscriberCount?: string }; contentDetails: { relatedPlaylists: { uploads: string } } }[] }>(
      `https://www.googleapis.com/youtube/v3/channels?part=statistics,contentDetails&id=${conn.accountId}`,
      token
    ),
    collectReach(conn, token).catch(() => {}),
  ]);

  // the newest uploads too, even if nobody's watched them yet in the range
  const uploads = channel.items?.[0]?.contentDetails.relatedPlaylists.uploads;
  const latest = uploads
    ? await call<{ items?: { contentDetails: { videoId: string } }[] }>(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=10&playlistId=${uploads}`,
        token
      ).then((r) => (r.items ?? []).map((i) => i.contentDetails.videoId))
    : [];
  const ids = [...new Set([...perVideo.map((r) => String(r.video)), ...latest])];
  const details = new Map((await videos(token, ids)).map((v) => [v.id, v]));

  const reach = await prisma.youtubeReach.findMany({
    where: { clientId: conn.clientId, day: { gte: from, lte: to } },
  });
  const reachOf = (videoId?: string) => sumReach(videoId ? reach.filter((r) => r.videoId === videoId) : reach);
  const hasReach = reach.length > 0;

  const t = totals[0] ?? {};
  const b = before[0] ?? {};
  const n = (r: Row, k: string) => (r[k] === undefined ? null : Number(r[k]));
  const whole = reachOf();

  const rows: ContentRow[] = ids.flatMap((id) => {
    const v = details.get(id);
    if (!v) return [];
    const r = perVideo.find((x) => x.video === id) ?? {};
    const rr = reachOf(id);
    return [
      {
        id,
        title: v.snippet.title,
        url: `https://www.youtube.com/watch?v=${id}`,
        thumbnail: v.snippet.thumbnails?.medium?.url ?? v.snippet.thumbnails?.default?.url ?? null,
        published: v.snippet.publishedAt.slice(0, 10),
        // Shorts can run to three minutes now
        kind: isoSeconds(v.contentDetails.duration) <= 180 ? "Short" : "Video",
        stats: {
          views: n(r, "views") ?? 0,
          watchHours: r.estimatedMinutesWatched === undefined ? 0 : Number(r.estimatedMinutesWatched) / 60,
          avgViewSec: n(r, "averageViewDuration"),
          avgViewPct: r.averageViewPercentage === undefined ? null : Number(r.averageViewPercentage) / 100,
          likes: n(r, "likes"),
          comments: n(r, "comments"),
          shares: n(r, "shares"),
          subscribers: n(r, "subscribersGained"),
          impressions: hasReach ? rr.impressions : null,
          ctr: hasReach ? rr.ctr : null,
        },
      },
    ];
  });

  const byDay = new Map(daily.map((d) => [String(d.day), Number(d.views)]));
  const subscribers = Number(channel.items?.[0]?.statistics.subscriberCount ?? NaN);

  return {
    platform: "youtube",
    account: {
      name: conn.accountName,
      image: conn.accountImage,
      url: `https://www.youtube.com/channel/${conn.accountId}`,
      followers: Number.isFinite(subscribers) ? subscribers : null,
    },
    from,
    to,
    fetchedAt: new Date().toISOString(),
    metrics: [
      { key: "views", label: "Views", value: n(t, "views"), previous: n(b, "views"), format: "count" },
      {
        key: "watch",
        label: "Watch time",
        value: t.estimatedMinutesWatched === undefined ? null : Number(t.estimatedMinutesWatched) / 60,
        previous: b.estimatedMinutesWatched === undefined ? null : Number(b.estimatedMinutesWatched) / 60,
        format: "hours",
      },
      { key: "impressions", label: "Impressions", value: hasReach ? whole.impressions : null, format: "count", hint: "How often a thumbnail was shown on YouTube" },
      { key: "ctr", label: "Click-through rate", value: hasReach ? whole.ctr : null, format: "percent", hint: "Of those impressions, how many became a view" },
      { key: "avgView", label: "Avg view duration", value: n(t, "averageViewDuration"), previous: n(b, "averageViewDuration"), format: "seconds" },
      {
        key: "subs",
        label: "Subscribers gained",
        value: t.subscribersGained === undefined ? null : Number(t.subscribersGained) - Number(t.subscribersLost ?? 0),
        previous: b.subscribersGained === undefined ? null : Number(b.subscribersGained) - Number(b.subscribersLost ?? 0),
        format: "count",
        hint: "Net — gained minus lost",
      },
      { key: "likes", label: "Likes", value: n(t, "likes"), previous: n(b, "likes"), format: "count" },
      { key: "comments", label: "Comments", value: n(t, "comments"), previous: n(b, "comments"), format: "count" },
      { key: "shares", label: "Shares", value: n(t, "shares"), previous: n(b, "shares"), format: "count" },
    ],
    series: daysBetween(from, to).map((day) => ({ day, value: byDay.get(day) ?? 0 })),
    seriesLabel: "Views per day",
    columns: [
      { key: "views", label: "Views", format: "count" },
      { key: "watchHours", label: "Watch time", format: "hours" },
      { key: "avgViewPct", label: "Avg % viewed", format: "percent" },
      { key: "impressions", label: "Impressions", format: "count" },
      { key: "ctr", label: "CTR", format: "percent" },
      { key: "likes", label: "Likes", format: "count" },
      { key: "comments", label: "Comments", format: "count" },
      { key: "shares", label: "Shares", format: "count" },
      { key: "subscribers", label: "Subs", format: "count" },
    ],
    rows,
    notes: [
      ...(conn.reachJobId
        ? hasReach
          ? []
          : ["Impressions and CTR arrive as daily files from YouTube, starting a day or two after connecting — they'll fill in shortly."]
        : ["Impressions and CTR need the YouTube Reporting API switched on in the Google Cloud project, then the channel connected again."]),
      "YouTube's numbers run a day or two behind.",
    ],
  };
}
