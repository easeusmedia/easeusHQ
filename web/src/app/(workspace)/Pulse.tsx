"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { emitPulse, type PulseData } from "./pulseStore";

// Keeps an open tab current. Every 15s (only while it's visible, and once
// on coming back to it) it asks /api/pulse whether anything changed, and
// re-renders the page only when something did — it used to re-render the
// whole page every 15s whether or not anything had. Also marks you active,
// and hands the answer to the delivery chime and client messages.
export function Pulse({ intervalMs = 15000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    let seen: string | null = null;
    let busy = false;
    async function tick() {
      if (document.visibilityState !== "visible" || busy) return;
      busy = true;
      try {
        const res = await fetch("/api/pulse", { cache: "no-store" });
        if (res.status === 401) return router.refresh(); // signed out: the page sends you to sign in
        if (!res.ok) return;
        const data: PulseData = await res.json();
        if (seen !== null && data.v !== seen) router.refresh();
        seen = data.v;
        emitPulse(data);
      } catch {
        // offline for a moment: the next tick tries again
      } finally {
        busy = false;
      }
    }
    tick();
    const id = setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, intervalMs]);
  return null;
}
