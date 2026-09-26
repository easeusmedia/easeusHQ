import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { youtubeDashboard } from "@/lib/youtube";
import { instagramDashboard, instagramData } from "@/lib/instagram";
import { instagramUsername, previousRange, socialLink, type Dashboard } from "@/lib/analytics";

// a channel with years of uploads is a good few calls to page through
export const maxDuration = 60;

// kept this long before the platforms are asked again (Refresh skips it)
const FRESH_MS = 6 * 60 * 60 * 1000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

// One client's dashboard for one platform and date range, for the Analytics
// tab — their public numbers, read by the team's own connection (see
// Integrations). Anyone on the team can read it.
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
  try {
    // Instagram: a background scrape of their profile, kept a few hours and
    // read for any range it covers (lib/instagram.ts)
    if (platform === "instagram") {
      const username = instagramUsername(account);
      if (!username) return NextResponse.json({ connected: true, error: "That doesn't look like an Instagram account." });
      const got = await instagramData(clientId, username, previousRange(from, to).from, refresh);
      if ("pending" in got) return NextResponse.json({ connected: true, pending: true });
      return NextResponse.json({
        connected: true,
        dashboard: instagramDashboard(username, got.profile, got.posts, got.fetchedAt, from, to),
      });
    }

    const key = `${platform}:${account}:${from}:${to}`;
    if (!refresh) {
      const hit = await prisma.analyticsCache.findUnique({ where: { clientId_key: { clientId, key } } });
      if (hit && Date.now() - hit.fetchedAt.getTime() < FRESH_MS) {
        return NextResponse.json({ connected: true, dashboard: hit.data });
      }
    }
    const dashboard: Dashboard = await youtubeDashboard(account, from, to);
    const data = dashboard as unknown as Prisma.InputJsonValue;
    await prisma.analyticsCache.upsert({
      where: { clientId_key: { clientId, key } },
      create: { clientId, key, data },
      update: { data, fetchedAt: new Date() },
    });
    return NextResponse.json({ connected: true, dashboard });
  } catch (err) {
    return NextResponse.json({ connected: true, error: err instanceof Error ? err.message : "Couldn't load the numbers." });
  }
}
