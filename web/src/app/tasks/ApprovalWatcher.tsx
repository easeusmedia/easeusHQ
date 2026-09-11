"use client";

import { useEffect, useState } from "react";
import { PartyPopper, X } from "lucide-react";
import { getMyActiveTaskSnapshot } from "./actions";

// short synthesized chime (no audio asset to host/license) — a quick
// upward two-note ding. Browsers block audio with no prior user gesture
// on the page; since editors click around before a delivery notification
// would ever fire, this is normally already unlocked.
function playChime() {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    [660, 990].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.1;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.35);
    });
    setTimeout(() => ctx.close(), 600);
  } catch {
    // ignore — unsupported browser, or autoplay still locked
  }
}

type Seen = { status: string; title: string };

// Mounted once in tasks/layout.tsx for every employee, on every /tasks/*
// page — not just Board — so a delivery that happens while an editor is
// looking at History or Calendar still gets caught. Polls independently
// of LiveRefresh/router.refresh() for exactly that reason: this has to
// keep running regardless of which page's data happens to be loaded.
export function ApprovalWatcher({ userId }: { userId: string }) {
  const [celebration, setCelebration] = useState<string | null>(null);
  const seenKey = `approval-seen:${userId}`;

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      let tasks;
      try {
        tasks = await getMyActiveTaskSnapshot(userId);
      } catch {
        return; // network hiccup — next tick tries again
      }
      if (cancelled) return;

      let prev: Record<string, Seen> | null = null;
      try {
        const raw = localStorage.getItem(seenKey);
        prev = raw ? JSON.parse(raw) : null;
      } catch {
        prev = null;
      }

      if (prev) {
        const currentIds = new Set(tasks.map((t) => t.id));
        const delivered = Object.entries(prev)
          .filter(([id, entry]) => entry.status === "final_export_ready" && !currentIds.has(id))
          .map(([, entry]) => entry.title);
        if (delivered.length === 1) {
          setCelebration(`"${delivered[0]}" was delivered to the client — nice work!`);
          playChime();
        } else if (delivered.length > 1) {
          setCelebration(`${delivered.length} of your tasks were delivered to the client — nice work!`);
          playChime();
        }
      }

      try {
        const next: Record<string, Seen> = {};
        for (const t of tasks) next[t.id] = { status: t.status, title: t.title };
        localStorage.setItem(seenKey, JSON.stringify(next));
      } catch {
        // ignore — worst case, a fresh localStorage means we just re-bootstrap silently
      }
    }

    // 15s, not 5s — same reasoning as LiveRefresh: this is a second,
    // independent server round-trip running continuously on every editor's
    // browser, and it doesn't need sub-15s latency to still feel live.
    // Also skips ticks while the tab is hidden and catches up once on
    // return, instead of polling a tab nobody's looking at.
    function tick() {
      if (document.visibilityState === "visible") poll();
    }
    tick();
    const id = setInterval(tick, 15000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [userId, seenKey]);

  if (!celebration) return null;

  return (
    <div className="glass fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl px-4 py-3 pr-3 shadow-2xl">
      <PartyPopper size={18} className="shrink-0 text-emerald-300" />
      <p className="text-sm">{celebration}</p>
      <button
        type="button"
        onClick={() => setCelebration(null)}
        aria-label="Dismiss"
        className="btn-ghost -mr-1 ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
      >
        <X size={14} />
      </button>
    </div>
  );
}
