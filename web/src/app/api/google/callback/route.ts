import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { isAbhishekOrAdmin } from "@/lib/actingUser";
import { DRIVE_SETTINGS, ensureAppFolder, exchangeCode, saveDriveSettings } from "@/lib/drive";
import { connectYoutube } from "@/lib/youtube";
import { finishState } from "@/lib/socialConnect";

// Where Google sends the admin back after they approve the Drive connection.
// The code in the address is one-time and useless on its own; it's traded
// here for the lasting connection, which never leaves the server.
export async function GET(request: Request) {
  const url = new URL(request.url);
  // The YouTube connection for client analytics comes back here too — the
  // same Google app, so the same registered address — told apart by the
  // state it carries.
  if (url.searchParams.get("state")?.startsWith("ytp:")) return youtube(url);

  const sessionUserId = await getSessionUserId();
  const user = sessionUserId ? await prisma.user.findUnique({ where: { id: sessionUserId } }) : null;
  if (!user || !isAbhishekOrAdmin(user)) return NextResponse.redirect(new URL("/login", url.origin));

  const error = url.searchParams.get("error");
  if (error) return NextResponse.redirect(new URL(`/integrations?error=${encodeURIComponent(error)}`, url.origin));

  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/integrations?error=no-code", url.origin));

  try {
    const { refreshToken, email } = await exchangeCode(code, url.origin);
    await saveDriveSettings({ [DRIVE_SETTINGS.refreshToken]: refreshToken, [DRIVE_SETTINGS.account]: email });
    // and give it somewhere to put things, straight away
    const folder = await ensureAppFolder();
    return NextResponse.redirect(new URL(`/integrations?connected=1&folder=${encodeURIComponent(folder.name)}`, url.origin));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't finish connecting.";
    return NextResponse.redirect(new URL(`/integrations?error=${encodeURIComponent(message)}`, url.origin));
  }
}

// Finishing the team's YouTube connection (client analytics' public numbers)
async function youtube(url: URL) {
  const sessionUserId = await getSessionUserId();
  const user = sessionUserId ? await prisma.user.findUnique({ where: { id: sessionUserId } }) : null;
  if (!user || !isAbhishekOrAdmin(user)) return NextResponse.redirect(new URL("/login", url.origin));
  const back = (error?: string) =>
    NextResponse.redirect(new URL(`/integrations${error ? `?analyticsError=${encodeURIComponent(error)}` : "?analytics=youtube"}`, url.origin));
  if (!(await finishState(url.searchParams.get("state"), "ytp"))) return back("That sign-in didn't start here — try again.");
  const denied = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  if (denied || !code) return back(denied ?? "Google didn't send a code back.");
  try {
    await connectYoutube(code, url.origin);
    return back();
  } catch (err) {
    return back(err instanceof Error ? err.message : "Couldn't finish connecting.");
  }
}
