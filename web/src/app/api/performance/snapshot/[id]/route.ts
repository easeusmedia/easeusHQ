import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";

// The snapshot of the frame a Frame.io comment was left on. Core and admin
// see anyone's; an editor sees only their own.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getSessionUserId();
  const me = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } }) : null;
  if (!me) return new Response("Not signed in.", { status: 401 });
  const snap = await prisma.feedbackSnapshot.findUnique({ where: { entryId: id }, select: { image: true, entry: { select: { editorId: true } } } });
  if (!snap || (me.role === "employee" && snap.entry.editorId !== me.id)) return new Response("Not found.", { status: 404 });
  return new Response(new Uint8Array(snap.image), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400, immutable" },
  });
}
