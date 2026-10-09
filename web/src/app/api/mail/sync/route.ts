import { NextResponse } from "next/server";
import { getViewer } from "@/lib/viewer";
import { seesSalesMail } from "@/lib/scope";
import { syncSalesInboxIfDue } from "@/lib/mailSync";

export const dynamic = "force-dynamic";

// The sales inbox read again, at most once a minute across everyone, while
// a board or the Email page is on screen (TrackerChip asks): a reply shows
// up on its own, without waiting for the next page load
export async function POST() {
  const viewer = await getViewer();
  if (!viewer || !seesSalesMail(viewer)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  await syncSalesInboxIfDue(60_000);
  return NextResponse.json({ ok: true });
}
