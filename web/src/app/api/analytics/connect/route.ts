import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { isAbhishekOrAdmin } from "@/lib/actingUser";
import { youtubeConsentUrl } from "@/lib/youtube";
import { startState } from "@/lib/socialConnect";

// "Connect YouTube" under Integrations → Client analytics: off to Google's
// consent screen with the team's account, once. Admin only — it's the
// company's account doing the reading for every client.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = await getSessionUserId();
  const user = id ? await prisma.user.findUnique({ where: { id } }) : null;
  if (!user || !isAbhishekOrAdmin(user)) return NextResponse.redirect(new URL("/login", url.origin));
  const platform = url.searchParams.get("platform");
  try {
    if (platform === "youtube") return NextResponse.redirect(await youtubeConsentUrl(url.origin, await startState("ytp")));
    return NextResponse.redirect(new URL("/integrations", url.origin));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't start connecting.";
    return NextResponse.redirect(new URL(`/integrations?analyticsError=${encodeURIComponent(message)}`, url.origin));
  }
}
