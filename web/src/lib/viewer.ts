import { cache } from "react";
import { AsyncLocalStorage } from "node:async_hooks";
import { prisma } from "./prisma";
import { getRealViewer, getSessionUserId, VIEWER_SELECT } from "./auth";
import type { Viewer } from "./scope";

export { VIEWER_SELECT };

// A request made as someone without their session cookie: their Claude,
// through a connection key (lib/mcp). Everything run inside sees them as
// the viewer, so every action checks and records them as usual.
const acting = new AsyncLocalStorage<Viewer & { name: string }>();
export const runAs = <T>(viewer: Viewer & { name: string }, work: () => Promise<T>): Promise<T> => acting.run(viewer, work);

// The signed-in person as a Viewer, once per request. Looking as themselves
// (the usual), it's the row signing in already read; only "View as" asks
// for someone else's.
export const getViewer = cache(async (): Promise<(Viewer & { name: string }) | null> => {
  const as = acting.getStore();
  if (as) return as;
  const id = await getSessionUserId();
  if (!id) return null;
  const me = await getRealViewer();
  return me?.id === id ? me : prisma.user.findUnique({ where: { id }, select: VIEWER_SELECT });
});
