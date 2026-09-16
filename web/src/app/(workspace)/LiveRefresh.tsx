"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Cheap stand-in for real-time sync ($0, no websockets/Supabase Realtime
// wired up yet): re-fetches the current page on an interval so a status
// change made by someone else (e.g. an editor moving their own task) shows
// up here without a manual reload.
//
// 15s, not 5s — every tick is a full server-component re-render (users +
// projects + tasks queries), running in every open tab at once. 5s made
// that background work frequent enough to compete with whatever the user
// was actually doing (a click landing mid-refresh reads as lag). Also
// skips ticks while the tab is hidden — nobody's watching a background
// tab update live — and refreshes once immediately on returning to it, so
// switching back still feels current instead of stale for up to 15s.
export function LiveRefresh({ intervalMs = 15000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    function tick() {
      if (document.visibilityState === "visible") router.refresh();
    }
    const id = setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, intervalMs]);
  return null;
}
