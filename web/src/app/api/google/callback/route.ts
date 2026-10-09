import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { isAbhishekOrAdmin } from "@/lib/actingUser";
import { DRIVE_SETTINGS, ensureAppFolder, exchangeCode, saveDriveSettings } from "@/lib/drive";
import { GMAIL_SETTINGS, SALES_GMAIL_SETTINGS } from "@/lib/gmail";
import { CALENDAR_SETTINGS } from "@/lib/googleCalendar";

// Where Google sends the admin back after they approve the Drive connection.
// The code in the address is one-time and useless on its own; it's traded
// here for the lasting connection, which never leaves the server.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionUserId = await getSessionUserId();
  const user = sessionUserId ? await prisma.user.findUnique({ where: { id: sessionUserId } }) : null;
  if (!user || !isAbhishekOrAdmin(user)) return NextResponse.redirect(new URL("/login", url.origin));

  const error = url.searchParams.get("error");
  if (error) return NextResponse.redirect(new URL(`/integrations?error=${encodeURIComponent(error)}`, url.origin));

  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/integrations?error=no-code", url.origin));

  try {
    const { refreshToken, email, scope } = await exchangeCode(code, url.origin);
    // the Gmail connection (contract tracking), kept apart from Drive's
    // the sales inbox (replies and response times), its own connection too
    if (url.searchParams.get("state") === "sales-gmail") {
      await saveDriveSettings({ [SALES_GMAIL_SETTINGS.refreshToken]: refreshToken, [SALES_GMAIL_SETTINGS.account]: email });
      return NextResponse.redirect(new URL("/integrations?salesGmail=1", url.origin));
    }
    if (url.searchParams.get("state") === "gmail") {
      await saveDriveSettings({ [GMAIL_SETTINGS.refreshToken]: refreshToken, [GMAIL_SETTINGS.account]: email, [GMAIL_SETTINGS.canSend]: scope.includes("gmail.send") ? "1" : "" });
      return NextResponse.redirect(new URL("/integrations?gmail=1", url.origin));
    }
    // the Calendar connection (Home's meetings), kept apart too
    if (url.searchParams.get("state") === "calendar") {
      await saveDriveSettings({ [CALENDAR_SETTINGS.refreshToken]: refreshToken, [CALENDAR_SETTINGS.account]: email });
      return NextResponse.redirect(new URL("/integrations?calendar=1", url.origin));
    }
    await saveDriveSettings({ [DRIVE_SETTINGS.refreshToken]: refreshToken, [DRIVE_SETTINGS.account]: email });
    // and give it somewhere to put things, straight away
    const folder = await ensureAppFolder();
    return NextResponse.redirect(new URL(`/integrations?connected=1&folder=${encodeURIComponent(folder.name)}`, url.origin));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't finish connecting.";
    return NextResponse.redirect(new URL(`/integrations?error=${encodeURIComponent(message)}`, url.origin));
  }
}
