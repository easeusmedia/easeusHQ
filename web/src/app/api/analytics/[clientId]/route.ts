import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { channelUrl, youtubeDashboard, youtubeData } from "@/lib/youtube";
import { instagramDashboard, instagramData } from "@/lib/instagram";
import { instagramUsername, previousRange, socialLink } from "@/lib/analytics";

// checking on a scrape and reading its results is a few quick calls
export const maxDuration = 60;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

// One client's dashboard for one platform and date range, for the Analytics
// tab — their public numbers, scraped with Apify (lib/apify.ts). Anyone on
// the team can read it. While a scrape is still running it answers
// "pending", and the tab asks again shortly.
export async function GET(request: Request, { params }: { params: Promise<{ clientId: string }> }) {
  if (!(await getSessionUserId())) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { clientId } = await params;
  const url = new URL(request.url);
  const platform = url.searchParams.get("platform");
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  if ((platform !== "youtube" && platform !== "instagram") || !DAY.test(from) || !DAY.test(to) || from > to) {
    return NextResponse.json({ error: "That isn't a date range." }, { status: 400 });
  }
  if (Date.parse(to) - Date.parse(from) > 400 * 86_400_000) {
    return NextResponse.json({ error: "Pick a range of a year or less." }, { status: 400 });
  }

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { youtubeChannel: true, instagramHandle: true, socialLinks: true },
  });
  if (!client) return NextResponse.json({ error: "No such client." }, { status: 404 });
  const account =
    platform === "youtube"
      ? (client.youtubeChannel ?? socialLink(client.socialLinks, "youtube.com"))
      : (client.instagramHandle ?? socialLink(client.socialLinks, "instagram.com"));
  if (!account) return NextResponse.json({ connected: false });

  const refresh = url.searchParams.get("refresh") === "1";
  const since = previousRange(from, to).from;
  try {
    if (platform === "instagram") {
      const username = instagramUsername(account);
      if (!username) return NextResponse.json({ connected: true, error: "That doesn't look like an Instagram account." });
      const got = await instagramData(clientId, username, since, refresh);
      if ("pending" in got) return NextResponse.json({ connected: true, pending: true });
      return NextResponse.json({
        connected: true,
        dashboard: instagramDashboard(username, got.profile, got.posts, got.fetchedAt, from, to),
      });
    }
    const channel = channelUrl(account);
    if (!channel) return NextResponse.json({ connected: true, error: "That doesn't look like a YouTube channel." });
    const got = await youtubeData(clientId, channel, since, refresh);
    if ("pending" in got) return NextResponse.json({ connected: true, pending: true });
    return NextResponse.json({ connected: true, dashboard: youtubeDashboard(channel, got.videos, got.fetchedAt, from, to) });
  } catch (err) {
    return NextResponse.json({ connected: true, error: err instanceof Error ? err.message : "Couldn't load the numbers." });
  }
}
