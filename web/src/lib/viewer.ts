import { cache } from "react";
import { prisma } from "./prisma";
import { getSessionUserId } from "./auth";
import type { Viewer } from "./scope";

// What every access rule needs to know about someone (lib/scope.ts)
export const VIEWER_SELECT = {
  id: true,
  name: true,
  role: true,
  email: true,
  teamId: true,
  departments: { select: { id: true, slug: true } },
} as const;

// The signed-in person as a Viewer, once per request
export const getViewer = cache(async (): Promise<(Viewer & { name: string }) | null> => {
  const id = await getSessionUserId();
  return id ? prisma.user.findUnique({ where: { id }, select: VIEWER_SELECT }) : null;
});
