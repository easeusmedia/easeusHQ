import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { isAbhishekOrAdmin } from "@/lib/actingUser";
import { connectMeta } from "@/lib/instagram";
import { finishState } from "@/lib/socialConnect";

// Where Facebook sends the admin back after the one login that lets the app
// look up clients' public Instagram numbers.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = await getSessionUserId();
  const user = id ? await prisma.user.findUnique({ where: { id } }) : null;
  if (!user || !isAbhishekOrAdmin(user)) return NextResponse.redirect(new URL("/login", url.origin));
  const back = (error?: string) =>
    NextResponse.redirect(new URL(`/integrations${error ? `?analyticsError=${encodeURIComponent(error)}` : "?analytics=instagram"}`, url.origin));
  if (!(await finishState(url.searchParams.get("state"), "meta"))) return back("That sign-in didn't start here — try again.");
  const denied = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  const code = url.searchParams.get("code");
  if (denied || !code) return back(denied ?? "Facebook didn't send a code back.");
  try {
    await connectMeta(code, url.origin);
    return back();
  } catch (err) {
    return back(err instanceof Error ? err.message : "Couldn't finish connecting.");
  }
}
