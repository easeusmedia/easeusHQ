import { createSign } from "crypto";
import { prisma } from "./prisma";
import { DRIVE_SETTINGS, driveSettings } from "./drive";
import { daysBetween, isoSeconds, previousRange, youtubeRef, type ContentRow, type Dashboard } from "./analytics";

// Any client's YouTube channel, from its public numbers — subscribers, and
// every video's views, likes and comments — through the YouTube Data API.
// Nothing is connected per client and the client is never asked for
// anything: the app reads what anyone could see on the channel page.
//
// The API still wants to know who's asking. That's the team's own Google
// account, connected once under Integrations (it uses the same Google app as
// Drive, with YouTube Data API v3 switched on in its Cloud project), or —
// where it's set — the deploy's service account.
//
// What public data can't show: impressions, CTR, watch time, retention.
// YouTube keeps those for the channel's own managers.

export const YOUTUBE_SETTINGS = { refreshToken: "youtube.refreshToken", account: "youtube.account" } as const;
const SCOPE = "https://www.googleapis.com/auth/youtube.readonly";

export async function youtubeSettings(): Promise<Record<string, string>> {
  const rows = await prisma.appSetting.findMany({ where: { key: { startsWith: "youtube." } } });
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

// whether public YouTube numbers can be read at all
export async function youtubeReady(): Promise<boolean> {
  return !!(await youtubeSettings())[YOUTUBE_SETTINGS.refreshToken] || !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
}

async function googleApp() {
  const s = await driveSettings();
  const id = s[DRIVE_SETTINGS.clientId];
  const secret = s[DRIVE_SETTINGS.clientSecret];
  if (!id || !secret) throw new Error("The Google app isn't set up yet — add it under Integrations → Google Drive.");
  return { id, secret };
}

export async function youtubeConsentUrl(origin: string, state: string): Promise<string> {
  const { id } = await googleApp();
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: `${origin}/api/google/callback`,
    response_type: "code",
    access_type: "offline",
    prompt: "consent select_account",
    scope: `${SCOPE} https://www.googleapis.com/auth/userinfo.email`,
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

// The team's account, once: the one-time code for a lasting refresh token.
export async function connectYoutube(code: string, origin: string): Promise<void> {
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
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error_description ?? "Google wouldn't complete the connection.");
  if (!body.refresh_token) throw new Error("Google didn't return a lasting connection — try again.");
  const who = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${body.access_token}` },
  }).then((r) => r.json());
  for (const [key, value] of [
    [YOUTUBE_SETTINGS.refreshToken, body.refresh_token as string],
    [YOUTUBE_SETTINGS.account, (who?.email as string) ?? ""],
  ]) {
    await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }
  cached = null;
}

let cached: { token: string; expires: number } | null = null;

const b64 = (x: Buffer | string) => Buffer.from(x).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function token(): Promise<string> {
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const refresh = (await youtubeSettings())[YOUTUBE_SETTINGS.refreshToken];
  let body: { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (refresh) {
    const { id, secret } = await googleApp();
    body = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refresh, grant_type: "refresh_token" }),
    }).then((r) => r.json());
  } else if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const now = Math.floor(Date.now() / 1000);
    const claim = { iss: key.client_email, scope: SCOPE, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 };
    const unsigned = `${b64(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64(JSON.stringify(claim))}`;
    const assertion = `${unsigned}.${b64(createSign("RSA-SHA256").update(unsigned).sign(key.private_key))}`;
    body = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    }).then((r) => r.json());
  } else {
    throw new Error("YouTube isn't connected yet — an admin connects it once under Integrations → Client analytics.");
  }
  if (!body.access_token) {
    throw new Error(
      body.error === "invalid_grant"
        ? "The YouTube connection has lapsed — connect it again under Integrations."
        : (body.error_description ?? "Google wouldn't give a YouTube token.")
    );
  }
  cached = { token: body.access_token, expires: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return cached.token;
}

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`https://www.googleapis.com/youtube/v3/${path}?${new URLSearchParams(params)}`, {
    headers: { Authorization: `Bearer ${await token()}` },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message: string = body?.error?.message ?? `YouTube answered ${res.status}.`;
    throw new Error(/has not been used|is disabled/i.test(message) ? "Switch on YouTube Data API v3 in the Google Cloud project, then try again." : message);
  }
  return body as T;
}

type Channel = {
  id: string;
  snippet: { title: string; customUrl?: string; thumbnails?: { default?: { url: string } } };
  statistics: { subscriberCount?: string; viewCount?: string; videoCount?: string };
  contentDetails: { relatedPlaylists: { uploads: string } };
};

type Video = {
  id: string;
  snippet: { title: string; publishedAt: string; thumbnails?: { medium?: { url: string }; default?: { url: string } } };
  contentDetails: { duration: string };
  statistics: { viewCount?: string; likeCount?: string; commentCount?: string };
};

async function channel(input: string): Promise<Channel> {
  const ref = youtubeRef(input);
  if (!ref) throw new Error("That doesn't look like a YouTube channel — paste its link or @handle.");
  const by: Record<string, string> = "id" in ref ? { id: ref.id } : "handle" in ref ? { forHandle: `@${ref.handle}` } : { forUsername: ref.username };
  const { items } = await get<{ items?: Channel[] }>("channels", { part: "snippet,statistics,contentDetails", ...by });
  if (!items?.[0]) throw new Error(`YouTube has no channel at "${input}" — check the link or handle.`);
  return items[0];
}

// Every upload back to `since`, newest first, with its numbers
async function uploadsSince(playlist: string, since: string): Promise<Video[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 20; page++) {
    const r = await get<{ items?: { contentDetails: { videoId: string; videoPublishedAt?: string } }[]; nextPageToken?: string }>(
      "playlistItems",
      { part: "contentDetails", playlistId: playlist, maxResults: "50", ...(pageToken ? { pageToken } : {}) }
    );
    const items = r.items ?? [];
    ids.push(...items.filter((i) => (i.contentDetails.videoPublishedAt ?? "") >= since).map((i) => i.contentDetails.videoId));
    const oldest = items.at(-1)?.contentDetails.videoPublishedAt ?? "";
    if (!r.nextPageToken || oldest < since) break;
    pageToken = r.nextPageToken;
  }
  const videos: Video[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const r = await get<{ items?: Video[] }>("videos", { part: "snippet,contentDetails,statistics", id: ids.slice(i, i + 50).join(",") });
    videos.push(...(r.items ?? []));
  }
  return videos;
}

const num = (v?: string) => (v === undefined ? null : Number(v));

export async function youtubeDashboard(input: string, from: string, to: string): Promise<Dashboard> {
  const ch = await channel(input);
  const prev = previousRange(from, to);
  const videos = await uploadsSince(ch.contentDetails.relatedPlaylists.uploads, prev.from);
  const day = (v: Video) => v.snippet.publishedAt.slice(0, 10);
  const inRange = videos.filter((v) => day(v) >= from && day(v) <= to);
  const before = videos.filter((v) => day(v) >= prev.from && day(v) <= prev.to);

  const total = (list: Video[], k: keyof Video["statistics"]) => list.reduce((n, v) => n + (num(v.statistics[k]) ?? 0), 0);
  const engagement = (list: Video[]) => {
    const views = total(list, "viewCount");
    return views ? (total(list, "likeCount") + total(list, "commentCount")) / views : null;
  };
  const avg = (list: Video[]) => (list.length ? total(list, "viewCount") / list.length : null);

  const rows: ContentRow[] = inRange.map((v) => {
    const views = num(v.statistics.viewCount);
    const likes = num(v.statistics.likeCount);
    const comments = num(v.statistics.commentCount);
    return {
      id: v.id,
      title: v.snippet.title,
      url: `https://www.youtube.com/watch?v=${v.id}`,
      thumbnail: v.snippet.thumbnails?.medium?.url ?? v.snippet.thumbnails?.default?.url ?? null,
      published: day(v),
      // Shorts can run to three minutes now
      kind: isoSeconds(v.contentDetails.duration) <= 180 ? "Short" : "Video",
      stats: { views, likes, comments, engagement: views ? ((likes ?? 0) + (comments ?? 0)) / views : null },
    };
  });

  const byDay = new Map<string, number>();
  for (const r of rows) byDay.set(r.published, (byDay.get(r.published) ?? 0) + (r.stats.views ?? 0));

  return {
    platform: "youtube",
    account: {
      name: ch.snippet.title,
      image: ch.snippet.thumbnails?.default?.url ?? null,
      url: ch.snippet.customUrl ? `https://www.youtube.com/${ch.snippet.customUrl}` : `https://www.youtube.com/channel/${ch.id}`,
      followers: num(ch.statistics.subscriberCount),
    },
    from,
    to,
    fetchedAt: new Date().toISOString(),
    metrics: [
      { key: "views", label: "Views", value: total(inRange, "viewCount"), previous: total(before, "viewCount"), format: "count", hint: "On the videos published in this range, to date" },
      { key: "avgViews", label: "Avg views per video", value: avg(inRange), previous: avg(before), format: "count" },
      { key: "engagement", label: "Engagement rate", value: engagement(inRange), previous: engagement(before), format: "percent", hint: "Likes and comments per view" },
      { key: "videos", label: "Videos published", value: inRange.length, previous: before.length, format: "count" },
      { key: "likes", label: "Likes", value: total(inRange, "likeCount"), previous: total(before, "likeCount"), format: "count" },
      { key: "comments", label: "Comments", value: total(inRange, "commentCount"), previous: total(before, "commentCount"), format: "count" },
      { key: "subscribers", label: "Subscribers", value: num(ch.statistics.subscriberCount), format: "count", hint: "The channel's total now" },
      { key: "channelViews", label: "Channel views, all time", value: num(ch.statistics.viewCount), format: "count" },
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
