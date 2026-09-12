import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { notionCoverUrl } from "@/lib/notionClientImport";

// Notion's file URLs are signed and expire within the hour, so a cover can't
// be stored as a link. Rather than copying every image into this app, this
// resolves the current URL on demand and redirects to it. Cached for 50
// minutes — comfortably inside the signature's lifetime.
export const revalidate = 3000;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSessionUserId())) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id }, select: { notionPageId: true } });
  if (!project?.notionPageId) return new NextResponse("No cover", { status: 404 });

  try {
    const url = await notionCoverUrl(project.notionPageId);
    if (!url) return new NextResponse("No cover", { status: 404 });
    return NextResponse.redirect(url);
  } catch {
    return new NextResponse("No cover", { status: 404 });
  }
}
