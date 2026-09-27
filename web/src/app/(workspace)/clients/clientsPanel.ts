"use client";

import { useSyncExternalStore } from "react";

// Where the clients area is: the Clients dashboard, one client's own page
// (the capture is that client's address), and any of a client's projects.
export const CLIENTS_SECTION = /^\/(?:clients(?:\/([^/]+))?|projects\/[^/]+)$/;

// Which client a page belongs to when its address doesn't say — a project's
// page — so the sidebar can still show it as the one open. Set by that page
// (ActiveClient), cleared when it's left.
let active: string | null = null;
const activeListeners = new Set<() => void>();

export function setActiveClient(slug: string | null) {
  active = slug;
  for (const l of activeListeners) l();
}

export function useActiveClient(): string | null {
  return useSyncExternalStore(
    (l) => {
      activeListeners.add(l);
      return () => activeListeners.delete(l);
    },
    () => active,
    () => null
  );
}
