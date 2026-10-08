import { prisma } from "@/lib/prisma";
import { downloadFile } from "@/lib/drive";
import { DOC_ID } from "@/lib/docTrack";

export const dynamic = "force-dynamic";

// A tracked PDF's file, from Drive, for its viewer (or as a download with
// ?download). It never changes, so the CDN keeps it and Drive is asked once.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = DOC_ID.test(id) ? await prisma.trackedDoc.findUnique({ where: { id }, select: { name: true, driveFileId: true } }) : null;
  if (!doc) return new Response("This PDF isn't here.", { status: 404 });
  const file = await downloadFile(doc.driveFileId);
  if (!file.ok || !file.body) return new Response("This PDF couldn't be loaded.", { status: 502 });
  const download = new URL(request.url).searchParams.has("download");
  return new Response(file.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
      "Cache-Control": "public, max-age=3600, s-maxage=31536000, immutable",
    },
  });
}
