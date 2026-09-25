import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { isAbhishekOrAdmin } from "@/lib/actingUser";
import { FRAMEIO_SETTINGS, accounts, exchangeCode, saveFrameioSettings } from "@/lib/frameio";
import { frameioRedirectUri } from "@/lib/frameioClient";

// Where Adobe sends the admin back after they approve the Frame.io
// connection. The code in the address is one-time and useless on its own;
// it's traded here for the lasting connection, which never leaves the server.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionUserId = await getSessionUserId();
  const user = sessionUserId ? await prisma.user.findUnique({ where: { id: sessionUserId } }) : null;
  if (!user || !isAbhishekOrAdmin(user)) return NextResponse.redirect(new URL("/login", url.origin));

  const error = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (error) return NextResponse.redirect(new URL(`/integrations?error=${encodeURIComponent(error)}`, url.origin));

  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/integrations?error=no-code", url.origin));

  try {
    const { refreshToken, email } = await exchangeCode(code, frameioRedirectUri(url.origin));
    await saveFrameioSettings({
      [FRAMEIO_SETTINGS.refreshToken]: refreshToken,
      [FRAMEIO_SETTINGS.account]: email,
    });
    // There's more than one Frame.io account on this login, and a share only
    // resolves against the one that owns it. Pick the only one when there is
    // only one; otherwise the Integrations page asks which.
    const found = await accounts();
    if (found.length === 1) await saveFrameioSettings({ [FRAMEIO_SETTINGS.accountId]: found[0].id });
    return NextResponse.redirect(new URL(`/integrations?frameio=1`, url.origin));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't finish connecting.";
    return NextResponse.redirect(new URL(`/integrations?error=${encodeURIComponent(message)}`, url.origin));
  }
}
