import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { buildDashboard, istDay, previousRange, shiftDay, type Item } from "@/lib/analytics";
import { addressKey, collect, startSync, syncing, targets } from "@/lib/contentSync";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

// One client's dashboard for one platform and date range, for the Analytics
// tab — straight from what's stored (lib/contentSync.ts), so it's instant.
// Only when the range reaches back further than anything read for this
// account yet (or on Refresh) does it start a scrape; it then answers with
// what it has plus "syncing", and the tab asks again shortly.
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

  const target = (await targets([clientId])).find((t) => t.platform === platform);
  if (!target) return NextResponse.json({ connected: false });

  try {
    await collect();
    const since = previousRange(from, to).from;
    const account = await prisma.socialAccount.findUnique({ where: { clientId_platform: { clientId, platform } } });
    const handle = platform === "youtube" ? addressKey(target.handle) : target.handle;
    const sameAccount = account?.handle === handle;
    const covered = sameAccount && account?.coveredSince && istDay(account.coveredSince) <= since;
    let busy = await syncing(clientId, platform);
    if (!busy && (!covered || url.searchParams.get("refresh") === "1")) {
      await startSync({ clientIds: [clientId], platforms: [platform], since, origin: url.origin });
      busy = true;
    }

    const rows = await prisma.contentItem.findMany({
      where: { clientId, platform, publishedAt: { gte: new Date(`${since}T00:00:00+05:30`), lt: new Date(`${shiftDay(to, 1)}T00:00:00+05:30`) } },
    });
    const items: Item[] = rows.map((r) => ({
      externalId: r.externalId,
      clientId,
      platform,
      title: r.title,
      url: r.url,
      thumbnail: r.thumbnail,
      kind: r.kind,
      published: istDay(r.publishedAt),
      views: r.views,
      likes: r.likes,
      comments: r.comments,
    }));
    const fetchedAt = (sameAccount && account?.scrapedAt?.toISOString()) || new Date(0).toISOString();
    const dashboard =
      sameAccount || items.length
        ? buildDashboard(
            platform,
            {
              name: (sameAccount && account?.name) || (platform === "youtube" ? target.handle.replace("https://www.youtube.com/", "") : `@${target.handle}`),
              image: sameAccount ? (account?.image ?? null) : null,
              url: platform === "youtube" ? target.handle : `https://www.instagram.com/${target.handle}/`,
              followers: sameAccount ? (account?.followers ?? null) : null,
              totalViews: sameAccount ? (account?.totalViews ?? null) : null,
              totalPosts: sameAccount ? (account?.totalPosts ?? null) : null,
            },
            items,
            fetchedAt,
            from,
            to
          )
        : undefined;
    return NextResponse.json({ connected: true, dashboard, pending: busy && !covered, syncing: busy });
  } catch (err) {
    return NextResponse.json({ connected: true, error: err instanceof Error ? err.message : "Couldn't load the numbers." });
  }
}
