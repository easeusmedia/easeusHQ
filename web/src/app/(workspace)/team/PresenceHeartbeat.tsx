"use client";

import { useEffect } from "react";
import { pingPresence } from "./actions";

// ponytail: polling, not a socket — a minute of staleness on "who's
// active" is fine for an internal team panel, and this is a single upsert
// query instead of a persistent connection to run/monitor.
export function PresenceHeartbeat({ intervalMs = 60000 }: { intervalMs?: number }) {
  useEffect(() => {
    function tick() {
      if (document.visibilityState === "visible") pingPresence();
    }
    tick(); // mark active the moment a tab opens, not up to a minute later
    const id = setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [intervalMs]);
  return null;
}
