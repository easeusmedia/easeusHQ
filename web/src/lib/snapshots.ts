import { execFile } from "node:child_process";
import { prisma } from "./prisma";
import { smallVideoUrl } from "./frameio";

// A small picture of the frame each Frame.io comment was left on, so the
// editor can see exactly what was meant. Taken from Frame.io's 180p copy
// of the cut, 320 pixels wide, a few kilobytes each, and kept for four
// months (the comment's text stays for good).

export const SNAPSHOT_DAYS = 120;
// a sync takes this many at most; the rest wait for the next one
const PER_RUN = 40;

// The ffmpeg binary (about 77 MB) is handed in by the nightly job, the one
// function that ships it (api/cron/analytics): imported here, it rode along
// in every page that can sync Frame.io, in every deployment Vercel keeps,
// and filled the free plan's 10 GB of Functions Storage.
function ffmpeg(ffmpegPath: string | null, args: string[]): Promise<{ out: Buffer; err: string }> {
  return new Promise((resolve) => {
    if (!ffmpegPath) return resolve({ out: Buffer.alloc(0), err: "no ffmpeg" });
    execFile(ffmpegPath, args, { encoding: "buffer", maxBuffer: 5_000_000, timeout: 20_000 }, (_e, out, err) => resolve({ out, err: err.toString() }));
  });
}

export type SnapshotJob = { entryId: string; accountId: string; fileId: string; frame: number };

// Takes what's asked for, one proxy address and one frame rate per cut.
// Anything that fails (no proxy yet, ffmpeg missing) is simply skipped: the
// feedback still counts, it just has no picture.
// A time limit too, so a sync never runs long; the rest wait for the next.
export async function takeSnapshots(ffmpegPath: string | null, jobs: SnapshotJob[], budgetMs = 20_000): Promise<number> {
  if (!ffmpegPath) return 0;
  const stop = Date.now() + budgetMs;
  const cutoff = new Date(Date.now() - SNAPSHOT_DAYS * 86_400_000);
  const have = new Set(
    (await prisma.feedbackSnapshot.findMany({ where: { entryId: { in: jobs.map((j) => j.entryId) } }, select: { entryId: true } })).map((s) => s.entryId)
  );
  const wanted = await prisma.performanceEntry.findMany({ where: { id: { in: jobs.map((j) => j.entryId) }, at: { gte: cutoff } }, select: { id: true } });
  const recent = new Set(wanted.map((w) => w.id));
  const todo = jobs.filter((j) => !have.has(j.entryId) && recent.has(j.entryId)).slice(0, PER_RUN);

  const byFile = new Map<string, SnapshotJob[]>();
  for (const j of todo) byFile.set(j.fileId, [...(byFile.get(j.fileId) ?? []), j]);
  let taken = 0;
  for (const [fileId, list] of byFile) {
    if (Date.now() > stop) break;
    const url = await smallVideoUrl(list[0].accountId, fileId).catch(() => null);
    if (!url) continue;
    const fps = Number((await ffmpeg(ffmpegPath, ["-hide_banner", "-i", url])).err.match(/([\d.]+) fps/)?.[1] ?? 0);
    if (!fps) continue;
    for (const j of list) {
      if (Date.now() > stop) break;
      const { out } = await ffmpeg(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-ss", String(j.frame / fps), "-i", url, "-frames:v", "1", "-vf", "scale=320:-2", "-q:v", "7", "-c:v", "mjpeg", "-f", "image2", "pipe:1"]);
      if (out.length < 200) continue;
      const image = new Uint8Array(out);
      await prisma.feedbackSnapshot.upsert({ where: { entryId: j.entryId }, create: { entryId: j.entryId, image }, update: { image } });
      taken++;
    }
  }
  return taken;
}

// Snapshots older than four months go; the feedback they belong to stays.
export async function clearOldSnapshots(): Promise<number> {
  const cutoff = new Date(Date.now() - SNAPSHOT_DAYS * 86_400_000);
  const { count } = await prisma.feedbackSnapshot.deleteMany({ where: { entry: { at: { lt: cutoff } } } });
  return count;
}
