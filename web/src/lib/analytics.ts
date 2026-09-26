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

// ISO 8601 duration ("PT1M5S") in seconds
export function isoSeconds(duration: string | null | undefined): number {
  const m = duration?.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 86400 + Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0);
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
