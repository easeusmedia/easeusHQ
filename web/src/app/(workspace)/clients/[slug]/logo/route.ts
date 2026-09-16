import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";

// A client's logo, served as an image. It's stored as a data: URI (see
// Client.avatarUrl); pages link here instead of inlining it (clientLogoSrc),
// and the ?v= in that link changes with the logo, so it caches for good.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await getSessionUserId())) return new Response(null, { status: 401 });
  const { slug } = await params;
  const client = await prisma.client.findUnique({ where: { slug }, select: { avatarUrl: true } });
  const match = client?.avatarUrl?.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) return new Response(null, { status: 404 });

  return new Response(Buffer.from(match[2], "base64"), {
    headers: {
      "Content-Type": match[1],
      // private: it's behind sign-in, so no shared cache should keep it
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
