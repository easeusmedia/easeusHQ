import { NextResponse } from "next/server";
import { collect, dailySync } from "@/lib/contentSync";

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
  await collect();
  return NextResponse.json(await dailySync(origin));
}
