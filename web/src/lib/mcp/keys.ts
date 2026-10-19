import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { VIEWER_SELECT } from "@/lib/auth";
import { onStaff } from "@/lib/users";
import { connectsClaude, type Viewer } from "@/lib/scope";

// A connection key: 32 URL-safe characters, kept only as a hash. Handed to
// someone's Claude when they sign in and allow it (lib/mcp/oauth), or made
// by scripts/mcp-key.ts.
export const makeKey = () => randomBytes(24).toString("base64url");
export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

// Whose key this is, as the viewer every action will see: on staff, still
// allowed to connect (connectsClaude), not taken back. Their name says the work came through Claude, so a lead's
// record reads "Assigned by Abhishek via Claude".
export async function viewerForKey(key: string): Promise<(Viewer & { name: string; connectionId: string; lastUsedAt: Date | null }) | null> {
  if (!/^[A-Za-z0-9_-]{32}$/.test(key)) return null;
  const c = await prisma.connection.findUnique({
    where: { keyHash: hashKey(key) },
    select: {
      id: true,
      revokedAt: true,
      lastUsedAt: true,
      user: { select: { ...VIEWER_SELECT, employment: true } },
    },
  });
  if (!c || c.revokedAt || !onStaff(c.user) || !connectsClaude(c.user)) return null;
  const { employment: _e, ...user } = c.user;
  void _e;
  return {
    ...user,
    name: `${user.name} via Claude`,
    connectionId: c.id,
    lastUsedAt: c.lastUsedAt,
  };
}

// when it was last used, once a minute at most
export async function touchKey(id: string, lastUsedAt: Date | null) {
  if (lastUsedAt && Date.now() - lastUsedAt.getTime() < 60_000) return;
  await prisma.connection.update({ where: { id }, data: { lastUsedAt: new Date() } }).catch(() => {});
}
