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

// One day's file from YouTube's Reporting API: thumbnail impressions and
// click-through per video. CTR is kept as a fraction; the files have given
// it either way, so a file with any value over 1 is read as percentages.
// ponytail: that guess is per file — a file of all-sub-1% percentages would
// read 100x too low; check against Studio once real files arrive.
export function parseReachCsv(csv: string): { day: string; videoId: string; impressions: number; ctr: number }[] {
  const [head, ...lines] = csv.trim().split(/\r?\n/);
  if (!head) return [];
  const cols = head.split(",");
  const at = (name: string) => cols.indexOf(name);
  const [iDate, iVideo, iImp, iCtr] = [at("date"), at("video_id"), at("video_thumbnail_impressions"), at("video_thumbnail_impressions_ctr")];
  if ([iDate, iVideo, iImp, iCtr].includes(-1)) return [];
  const rows = lines
    .map((l) => l.split(","))
    .filter((c) => c[iVideo])
    .map((c) => ({
      day: `${c[iDate].slice(0, 4)}-${c[iDate].slice(4, 6)}-${c[iDate].slice(6, 8)}`,
      videoId: c[iVideo],
      impressions: Number(c[iImp]) || 0,
      ctr: Number(c[iCtr]) || 0,
    }));
  const percents = rows.some((r) => r.ctr > 1);
  return rows.map((r) => ({ ...r, ctr: percents ? r.ctr / 100 : r.ctr }));
}

// Impressions summed and click-through weighted by them — a video shown a
// million times at 2% counts for more than one shown ten times at 50%.
export function sumReach(rows: { impressions: number; ctr: number }[]): { impressions: number; ctr: number | null } {
  const impressions = rows.reduce((n, r) => n + r.impressions, 0);
  return {
    impressions,
    ctr: impressions ? rows.reduce((n, r) => n + r.impressions * r.ctr, 0) / impressions : null,
  };
}
