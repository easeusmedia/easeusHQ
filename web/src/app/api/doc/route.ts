import { NextResponse } from "next/server";
import { getRealViewer } from "@/lib/auth";
import { markDownloaded, startView, tick } from "@/lib/docTrack";

export const dynamic = "force-dynamic";

// What a tracked PDF's viewer (/d/[id]) reports, while it's read:
// { kind: "start", doc, mailId, pages } when it opens (answered with the
// reading's id), { kind: "tick", view, page, seconds } every few seconds,
// and { kind: "download", view }.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (body?.kind === "start" && typeof body.doc === "string") {
    // one of us, signed in: kept, not counted
    const self = !!(await getRealViewer().catch(() => null));
    const view = await startView(body.doc, body, self, request.headers.get("user-agent"));
    return NextResponse.json(view ? { view } : { error: "That PDF isn't here." }, { status: view ? 200 : 404 });
  }
  if (typeof body?.view !== "string") return NextResponse.json({ error: "Nothing to record." }, { status: 400 });
  if (body.kind === "tick") await tick(body.view, body.page, body.seconds);
  else if (body.kind === "download") await markDownloaded(body.view);
  return NextResponse.json({ ok: true });
}
