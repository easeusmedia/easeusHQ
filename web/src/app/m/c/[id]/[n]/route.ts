import { NextResponse } from "next/server";
import { getRealViewer } from "@/lib/auth";
import { recordClick } from "@/lib/mailTrack";

export const dynamic = "force-dynamic";

// A link in a tracked email (lib/mailTrack.ts): counted, then on to where
// it was written to go. Only to a link the email was logged with, so this
// address can't be used to send anyone anywhere else.
export async function GET(request: Request, { params }: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = await params;
  // someone signed in to the app is one of us, testing their own link
  const staff = !!(await getRealViewer().catch(() => null));
  const url = await recordClick(id, Number(n), staff).catch(() => null);
  if (url) return NextResponse.redirect(url, 302);
  return new Response("This link has expired.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
