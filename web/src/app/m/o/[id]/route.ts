import { after } from "next/server";
import { recordOpen } from "@/lib/mailTrack";

export const dynamic = "force-dynamic";

// A tracked email's 1-pixel image (lib/mailTrack.ts). It always answers at
// once and is never cached, so every open asks again; the open is recorded
// after the answer has gone.
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // straight from Gmail's own page: the sender's compose window
  const fromGmailPage = (request.headers.get("referer") ?? "").startsWith("https://mail.google.com");
  after(() => recordOpen(id.replace(/\.gif$/, ""), fromGmailPage).catch(() => {}));
  return new Response(PIXEL, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, private, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
