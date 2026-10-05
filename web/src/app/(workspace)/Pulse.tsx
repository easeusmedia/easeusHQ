"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { emitPulse, type PulseData } from "./pulseStore";

// Keeps an open tab current.
//
// Live: every write to a table the pages show sends a "changed" signal over
// Supabase Realtime (scripts/realtime.ts), and the page refreshes a moment
// after hearing one: a change made anywhere shows everywhere within about a
// second. A burst (a Notion sync) refreshes at most once every so often,
// and a tab that isn't being looked at catches up when it's looked at.
//
// Behind that, every so often (only while visible, and on coming back to
// it) it asks /api/pulse whether anything changed: the backstop if the live
// line drops, and what marks you active and feeds the delivery chime and
// client messages. With no live line it's all there is, so it asks more
// often. A tab nobody has touched for a few minutes stops asking (each ask
// reads the database) and catches up the moment someone moves or types.
// no mouse, keys, touch or scrolling for this long: the tab is left alone
const IDLE_MS = 3 * 60 * 1000;
const INPUT_EVENTS = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"] as const;

export function Pulse({ live }: { live?: { url: string; key: string } | null }) {
  const router = useRouter();
  const intervalMs = live ? 30_000 : 15_000;
  const url = live?.url;
  const key = live?.key;
  useEffect(() => {
    let seen: string | null = null;
    let busy = false;
    // the live line already refreshed for this change: the pulse only
    // catches its own version up, rather than refreshing a second time
    let refreshedLive = false;
    // a change heard while the tab was hidden
    let stale = false;
    let pending: ReturnType<typeof setTimeout> | null = null;
    let catchUp: ReturnType<typeof setTimeout> | null = null;
    let lastInput = Date.now();
    const idle = () => Date.now() - lastInput > IDLE_MS;

    async function tick() {
      if (document.visibilityState !== "visible" || busy || idle()) return;
      busy = true;
      try {
        const res = await fetch("/api/pulse", { cache: "no-store" });
        if (res.status === 401) return router.refresh(); // signed out: the page sends you to sign in
        if (!res.ok) return;
        const data: PulseData = await res.json();
        if (seen !== null && data.v !== seen && !refreshedLive) router.refresh();
        refreshedLive = false;
        seen = data.v;
        emitPulse(data);
      } catch {
        // offline for a moment: the next tick tries again
      } finally {
        busy = false;
      }
    }

    function refreshNow() {
      pending = null;
      if (document.visibilityState !== "visible") {
        stale = true;
        return;
      }
      refreshedLive = true;
      router.refresh();
      if (catchUp) clearTimeout(catchUp);
      catchUp = setTimeout(tick, 1500);
    }

    function onVisible() {
      if (document.visibilityState === "visible" && stale) {
        stale = false;
        refreshNow();
      } else tick();
    }

    function onInput() {
      const wasIdle = idle();
      lastInput = Date.now();
      if (wasIdle) tick();
    }
    tick();
    const id = setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", onVisible);
    for (const e of INPUT_EVENTS) window.addEventListener(e, onInput, { passive: true });

    // the live line, loaded only once the page is up
    let stop: (() => void) | undefined;
    let gone = false;
    if (url && key) {
      import("@supabase/realtime-js").then(({ RealtimeClient }) => {
        if (gone) return;
        const client = new RealtimeClient(`${url}/realtime/v1`, { params: { apikey: key } });
        const channel = client
          .channel("hq-changes")
          .on("broadcast", { event: "changed" }, () => {
            pending ??= setTimeout(refreshNow, 250);
          })
          .subscribe();
        stop = () => {
          client.removeChannel(channel);
          client.disconnect();
        };
      });
    }

    return () => {
      gone = true;
      clearInterval(id);
      if (pending) clearTimeout(pending);
      if (catchUp) clearTimeout(catchUp);
      document.removeEventListener("visibilitychange", onVisible);
      for (const e of INPUT_EVENTS) window.removeEventListener(e, onInput);
      stop?.();
    };
  }, [router, intervalMs, url, key]);
  return null;
}
