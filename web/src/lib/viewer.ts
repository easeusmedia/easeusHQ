import { cache } from "react";
import { prisma } from "./prisma";
import { getRealViewer, getSessionUserId, VIEWER_SELECT } from "./auth";
import type { Viewer } from "./scope";

export { VIEWER_SELECT };

// The signed-in person as a Viewer, once per request. Looking as themselves
// (the usual), it's the row signing in already read; only "View as" asks
// for someone else's.
export const getViewer = cache(async (): Promise<(Viewer & { name: string }) | null> => {
  const id = await getSessionUserId();
  if (!id) return null;
  const me = await getRealViewer();
  return me?.id === id ? me : prisma.user.findUnique({ where: { id }, select: VIEWER_SELECT });
});
