import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId, requireOps } from "@/lib/auth";
import { isAbhishekOrAdmin } from "@/lib/actingUser";
import { DRIVE_SETTINGS, ensureAppFolder, exchangeCode, saveDriveSettings } from "@/lib/drive";
import { connectYoutube } from "@/lib/youtube";
import { backToClient, finishState } from "@/lib/socialConnect";

// Where Google sends the admin back after they approve the Drive connection.
// The code in the address is one-time and useless on its own; it's traded
// here for the lasting connection, which never leaves the server.
export async function GET(request: Request) {
  const url = new URL(request.url);
  // A client's YouTube channel comes back here too — the same Google app, so
  // the same registered address — told apart by the state it carries.
  if (url.searchParams.get("state")?.startsWith("yt:")) return youtube(url);

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

// Finishing a client's YouTube connection (ops, not only admin)
async function youtube(url: URL) {
  if (!(await requireOps())) return NextResponse.redirect(new URL("/login", url.origin));
  const clientId = await finishState(url.searchParams.get("state"), "yt");
  if (!clientId) return NextResponse.redirect(new URL("/clients", url.origin));
  const denied = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  if (denied || !code) {
    return NextResponse.redirect(await backToClient(url.origin, clientId, "youtube", denied ?? "Google didn't send a code back."));
  }
  try {
    await connectYoutube(clientId, code, url.origin);
    return NextResponse.redirect(await backToClient(url.origin, clientId, "youtube"));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't finish connecting.";
    return NextResponse.redirect(await backToClient(url.origin, clientId, "youtube", message));
  }
}
