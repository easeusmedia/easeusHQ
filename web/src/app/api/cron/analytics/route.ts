import { NextResponse } from "next/server";
import { collect, dailySync } from "@/lib/contentSync";
import { trackContracts } from "@/app/(workspace)/contracts/tracking";
import ffmpegPath from "ffmpeg-static";
import { syncFrameioFeedback } from "@/lib/frameioFeedback";
import { clearOldSnapshots } from "@/lib/snapshots";
import { sweepOverdue } from "@/lib/taskTrack";

// The daily refresh of every client's public YouTube and Instagram numbers
// (vercel.json runs it at 2am India time). Safe to call any time by anyone:
// it does its work at most once every 20 hours (lib/contentSync.ts), so it
// can't be used to run up the Apify bill. With CRON_SECRET set on the
// deploy, only Vercel's scheduler gets through at all.
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  }
  const origin = new URL(request.url).origin;
  // anything left over from before first; a hiccup there mustn't stop tonight's refresh
  await collect().catch(() => {});
  // and catch up on contracts out for signature (Adobe's emails in Gmail)
  await trackContracts().catch(() => {});
  const result = await dailySync(origin);
  // last, so a slow Frame.io can't hold up the rest: yesterday's review
  // comments into the editors' feedback log, sorted by keywords, with
  // snapshots
  await syncFrameioFeedback(ffmpegPath).catch(() => {});
  // feedback snapshots older than four months go; their text stays
  await clearOldSnapshots().catch(() => {});
  // tasks past their completion date: a strike each, and notices (lib/overdue.ts)
  await sweepOverdue().catch(() => 0);
  return NextResponse.json(result);
}
