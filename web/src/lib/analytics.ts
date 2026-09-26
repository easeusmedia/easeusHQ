// What a client's analytics dashboard shows, whichever platform it came
// from — YouTube and Instagram are fetched differently (lib/youtube.ts,
// lib/instagram.ts) but land in this one shape, so the page draws both the
// same way. Plus the small pure pieces of arithmetic they share, kept here
// so they can be tested on their own.

export type Platform = "youtube" | "instagram";
export type Format = "count" | "percent" | "seconds" | "hours";

export type Metric = {
  key: string;
  label: string;
  value: number | null;
  // the same length of time just before, when the platform can say
  previous?: number | null;
  format: Format;
  hint?: string;
};

export type ContentRow = {
  id: string;
  title: string;
  url: string;
  thumbnail: string | null;
  published: string; // yyyy-mm-dd
  kind: string; // Video, Short, Reel, Post, Carousel
  stats: Record<string, number | null>;
};

export type Dashboard = {
  platform: Platform;
  account: { name: string; image: string | null; url: string; followers: number | null };
  from: string;
  to: string;
  fetchedAt: string;
  metrics: Metric[];
  series: { day: string; value: number }[];
  seriesLabel: string;
  columns: { key: string; label: string; format: Format }[];
  rows: ContentRow[];
  notes: string[];
};

// yyyy-mm-dd plus n days
export function shiftDay(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// The same number of days, ending the day before `from` — what "vs the
// previous period" compares against.
export function previousRange(from: string, to: string): { from: string; to: string } {
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
  return { from: shiftDay(from, -days), to: shiftDay(from, -1) };
}

// Every day from `from` to `to`, so a chart has no gaps where nothing happened.
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 1000; d = shiftDay(d, 1)) out.push(d);
  return out;
}

// Which YouTube channel a pasted value means: a channel link, an @handle
// (bare or in a link), a /user/ name, or the channel id itself.
export function youtubeRef(input: string | null | undefined): { id: string } | { handle: string } | { username: string } | null {
  const v = (input ?? "").trim();
  if (!v) return null;
  const id = v.match(/(?:^|\/channel\/)(UC[\w-]{22})(?:[/?#]|$)/);
  if (id) return { id: id[1] };
  const handle = v.match(/(?:^|youtube\.com\/)@([\w.-]+)/i);
  if (handle) return { handle: handle[1] };
  const user = v.match(/youtube\.com\/(?:user|c)\/([\w.-]+)/i);
  if (user) return { username: user[1] };
  // a bare word is most likely a handle typed without its @
  return /^[\w.-]+$/.test(v) ? { handle: v } : null;
}

// An Instagram username from a link or an @handle
export function instagramUsername(input: string | null | undefined): string | null {
  const v = (input ?? "").trim();
  const m = v.match(/instagram\.com\/([\w.]+)/i) ?? v.match(/^@?([\w.]+)$/);
  const name = m?.[1]?.toLowerCase();
  return name && !["p", "reel", "reels", "stories", "explore"].includes(name) ? name : null;
}

// The link a client gave on their onboarding form for a platform, if any
export function socialLink(links: unknown, host: string): string | null {
  if (!Array.isArray(links)) return null;
  const hit = (links as { url?: string }[]).find((l) => typeof l?.url === "string" && l.url.includes(host));
  return hit?.url ?? null;
}

// ---- from stored rows to what the pages show ----

// A stored video or post, as the dashboards read it
export type Item = {
  externalId: string;
  clientId: string;
  platform: Platform;
  title: string;
  url: string;
  thumbnail: string | null;
  kind: string;
  published: string; // yyyy-mm-dd, in India
  views: number | null;
  likes: number | null;
  comments: number | null;
};

export type Account = {
  name: string;
  image: string | null;
  url: string;
  followers: number | null;
  totalViews: number | null;
  totalPosts: number | null;
};

// the day a moment falls on in India, where the team is
export const istDay = (d: Date | string) => new Date(new Date(d).getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);

// Last week, Monday to Sunday, from a day
export function lastWeek(today: string): { from: string; to: string } {
  const back = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // days since Monday
  const monday = shiftDay(today, -back);
  return { from: shiftDay(monday, -7), to: shiftDay(monday, -1) };
}

const total = (list: Item[], k: "views" | "likes" | "comments") => list.reduce((n, i) => n + (i[k] ?? 0), 0);
const withViews = (list: Item[]) => list.filter((i) => i.views !== null);

// One client's dashboard for one platform, from what's stored.
export function buildDashboard(
  platform: Platform,
  account: Account,
  items: Item[],
  fetchedAt: string,
  from: string,
  to: string
): Dashboard {
  const prev = previousRange(from, to);
  const inRange = items.filter((i) => i.published >= from && i.published <= to);
  const before = items.filter((i) => i.published >= prev.from && i.published <= prev.to);
  const yt = platform === "youtube";
  const followers = account.followers;
  const avg = (list: Item[]) => (withViews(list).length ? total(list, "views") / withViews(list).length : null);
  // YouTube: likes and comments per view. Instagram: per post, against
  // followers — the usual public measure there, since reach isn't public.
  const engagement = (list: Item[]) => {
    const talk = total(list, "likes") + total(list, "comments");
    if (yt) return total(list, "views") ? talk / total(list, "views") : null;
    return followers && list.length ? talk / list.length / followers : null;
  };

  const rows: ContentRow[] = inRange.map((i) => ({
    id: i.externalId,
    title: i.title,
    url: i.url,
    thumbnail: i.thumbnail,
    published: i.published,
    kind: i.kind,
    stats: {
      views: i.views,
      likes: i.likes,
      comments: i.comments,
      engagement: yt
        ? i.views
          ? ((i.likes ?? 0) + (i.comments ?? 0)) / i.views
          : null
        : followers
          ? ((i.likes ?? 0) + (i.comments ?? 0)) / followers
          : null,
    },
  }));
  const byDay = new Map<string, number>();
  for (const r of rows) byDay.set(r.published, (byDay.get(r.published) ?? 0) + (r.stats.views ?? 0));
  const noun = yt ? "video" : "post";

  return {
    platform,
    account: { name: account.name, image: account.image, url: account.url, followers },
    from,
    to,
    fetchedAt,
    metrics: [
      { key: "views", label: "Views", value: total(inRange, "views"), previous: total(before, "views"), format: "count", hint: `On the ${noun}s published in this range, to date` },
      { key: "avgViews", label: yt ? "Avg views per video" : "Avg views per reel", value: avg(inRange), previous: avg(before), format: "count" },
      { key: "engagement", label: "Engagement rate", value: engagement(inRange), previous: engagement(before), format: "percent", hint: yt ? "Likes and comments per view" : "Likes and comments per post, against followers" },
      { key: "posts", label: yt ? "Videos published" : "Posts published", value: inRange.length, previous: before.length, format: "count" },
      { key: "likes", label: "Likes", value: total(inRange, "likes"), previous: total(before, "likes"), format: "count" },
      { key: "comments", label: "Comments", value: total(inRange, "comments"), previous: total(before, "comments"), format: "count" },
      { key: "followers", label: yt ? "Subscribers" : "Followers", value: followers, format: "count", hint: "The total now" },
      yt
        ? { key: "allViews", label: "Channel views, all time", value: account.totalViews, format: "count" }
        : { key: "allPosts", label: "Posts, all time", value: account.totalPosts, format: "count" },
    ],
    series: daysBetween(from, to).map((d) => ({ day: d, value: byDay.get(d) ?? 0 })),
    seriesLabel: `Views, by the day each ${noun} went up`,
    columns: [
      { key: "views", label: "Views", format: "count" },
      { key: "likes", label: "Likes", format: "count" },
      { key: "comments", label: "Comments", format: "count" },
      { key: "engagement", label: "Engagement", format: "percent" },
    ],
    rows,
    notes: [
      `Public numbers: each ${noun}'s views, likes and comments so far, for the ${noun}s published in the range — compared with the ones published in the same length of time before.`,
      yt
        ? "Impressions, click-through rate and watch time are private to the channel, so they aren't here."
        : "Reach, saves, shares and watch time are private to the account, so they aren't here.",
    ],
  };
}
