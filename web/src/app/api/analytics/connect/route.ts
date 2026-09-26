import { NextResponse } from "next/server";
import { requireOps } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { youtubeConsentUrl } from "@/lib/youtube";
import { instagramConsentUrl } from "@/lib/instagram";
import { backToClient, startState } from "@/lib/socialConnect";

// "Connect YouTube" / "Connect Instagram" on a client's Analytics tab: off to
// Google's or Instagram's own consent screen, which comes back to the
// callback with a one-time code. Ops only.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const platform = url.searchParams.get("platform");
  const clientId = url.searchParams.get("client") ?? "";
  if (!(await requireOps())) return NextResponse.redirect(new URL("/login", url.origin));
  if (!(await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } }))) {
    return NextResponse.redirect(new URL("/clients", url.origin));
  }
  try {
    if (platform === "youtube") {
      return NextResponse.redirect(await youtubeConsentUrl(url.origin, await startState("yt", clientId)));
    }
    if (platform === "instagram") {
      return NextResponse.redirect(await instagramConsentUrl(url.origin, await startState("ig", clientId)));
    }
    return NextResponse.redirect(new URL("/clients", url.origin));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't start connecting.";
    return NextResponse.redirect(await backToClient(url.origin, clientId, platform ?? "youtube", message));
  }
}
