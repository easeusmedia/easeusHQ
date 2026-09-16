"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// The app scrolls inside this div rather than the window, which quietly
// breaks both halves of normal browser behaviour:
//
//   - Back never returned you to where you were. The browser's own scroll
//     restoration only tracks window.scrollY, which is permanently 0 here,
//     so pressing Back on a project dropped you at the top of the client
//     page — "we came back somewhere else".
//   - Forward navigation kept the *old* page's scroll, because this div
//     survives the page change and Next's router only resets the window.
//
// So the div has to remember for itself: save on scroll, put it back when
// you return to that path, and reset to the top otherwise.
const KEY = "tasks:scroll";

function readAll(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || "{}");
  } catch {
    return {}; // private mode / storage disabled — just don't restore
  }
}

export function MainScroll({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Track the position in a variable, not by reading the DOM when we come
    // to write it. By the time this effect's cleanup runs on a navigation,
    // React has already swapped the new page into this same container and
    // its scrollTop has been clamped to 0 — reading it there would file the
    // *new* page's position under the *old* path, wiping the one thing we
    // were trying to keep.
    let last = el.scrollTop;
    // A timer, not requestAnimationFrame: rAF doesn't fire in a hidden tab,
    // so a save queued just before the user switches tabs would never run
    // and the position would be lost at exactly the moment they leave.
    let timer: ReturnType<typeof setTimeout> | undefined;
    function write() {
      const all = readAll();
      all[pathname] = last;
      try {
        sessionStorage.setItem(KEY, JSON.stringify(all));
      } catch {}
    }
    function onScroll() {
      last = el!.scrollTop; // synchronous — always the real current position
      if (timer) return; // coalesce a burst of scroll events into one write
      timer = setTimeout(() => {
        timer = undefined;
        write();
      }, 100);
    }
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      write(); // leaving: keep where it was, not where it was 100ms ago
      el.removeEventListener("scroll", onScroll);
    };
  }, [pathname]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = readAll()[pathname] ?? 0;
    if (!target) {
      el.scrollTop = 0;
      return;
    }
    // The page streams in (loading.tsx first, then content), so setting
    // scrollTop immediately would just clamp to 0 against a page that isn't
    // tall yet. Wait for the height, then jump — giving up after a beat
    // rather than chasing a page that never gets there.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = Date.now() + 3000;
    const tick = () => {
      if (el.scrollHeight - el.clientHeight >= target) {
        el.scrollTop = target;
        return;
      }
      if (Date.now() < deadline) timer = setTimeout(tick, 50);
    };
    tick();
    return () => clearTimeout(timer);
  }, [pathname]);

  return (
    // data-scroll-root: boards scroll this while a card is dragged near its edge
    <div ref={ref} data-scroll-root className={className}>
      {children}
    </div>
  );
}
