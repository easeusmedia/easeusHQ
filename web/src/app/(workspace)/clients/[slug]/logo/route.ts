import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { decodePicture } from "@/lib/photos";

// A client's logo, served as an image. It's stored as a data: URI (see
// Client.avatarUrl); pages link here instead of inlining it (clientLogoSrc),
// and the ?v= in that link changes with the logo, so it caches for good.
// Open to the team, and to anyone while the client's page is shared.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const client = await prisma.client.findUnique({ where: { slug }, select: { avatarUrl: true, shareEnabled: true } });
  if (!client?.shareEnabled && !(await getSessionUserId())) return new Response(null, { status: 401 });
  const picture = decodePicture(client?.avatarUrl);
  if (!picture) return new Response(null, { status: 404 });

  return new Response(new Uint8Array(picture.bytes), {
    headers: {
      "Content-Type": picture.type,
      // private: it's behind sign-in, so no shared cache should keep it
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
