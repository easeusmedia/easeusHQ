import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { decodePicture } from "@/lib/photos";

// Someone's profile photo, served as an image (see lib/photos.ts).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSessionUserId())) return new Response(null, { status: 401 });
  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id }, select: { avatarUrl: true } });
  const picture = decodePicture(user?.avatarUrl);
  if (!picture) return new Response(null, { status: 404 });

  return new Response(new Uint8Array(picture.bytes), {
    headers: {
      "Content-Type": picture.type,
      // private: it's behind sign-in, so no shared cache should keep it
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
