"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Cheap stand-in for real-time sync ($0, no websockets/Supabase Realtime
// wired up yet): re-fetches the current page on an interval so a status
// change made by someone else (e.g. an editor moving their own task) shows
// up here without a manual reload.
export function LiveRefresh({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return null;
}
