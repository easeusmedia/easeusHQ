// Temporary diagnostic route — delete once the intermittent 500 is confirmed fixed.
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, ms: Date.now() - start });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
