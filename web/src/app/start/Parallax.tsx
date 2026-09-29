"use client";

import { useEffect } from "react";

// Depth for the Everest scene (Shell.tsx): as the pointer moves across the
// page, the scene's layers shift a little against each other, the near
// ridges most and the sky least, as if you were standing in it. Eased, so
// it drifts rather than jumps, and it settles back when the pointer
// leaves. Off for anyone who's asked for less motion.
export function Parallax() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = document.documentElement.style;
    const target = { x: 0, y: 0 };
    const now = { x: 0, y: 0 };
    let frame = 0;
    let last = 0;
    // eased by time, not by frame, so it glides the same at any frame rate
    const step = (t: number) => {
      const k = last ? 1 - Math.exp(-(t - last) / 260) : 0.06;
      last = t;
      now.x += (target.x - now.x) * k;
      now.y += (target.y - now.y) * k;
      root.setProperty("--ev-x", now.x.toFixed(4));
      root.setProperty("--ev-y", now.y.toFixed(4));
      frame = Math.abs(target.x - now.x) + Math.abs(target.y - now.y) > 0.001 ? requestAnimationFrame(step) : 0;
      if (!frame) last = 0;
    };
    const go = () => {
      if (!frame) frame = requestAnimationFrame(step);
    };
    const move = (e: PointerEvent) => {
      target.x = (e.clientX / window.innerWidth) * 2 - 1;
      target.y = (e.clientY / window.innerHeight) * 2 - 1;
      go();
    };
    const leave = () => {
      target.x = 0;
      target.y = 0;
      go();
    };
    window.addEventListener("pointermove", move);
    document.documentElement.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
      root.removeProperty("--ev-x");
      root.removeProperty("--ev-y");
    };
  }, []);
  return null;
}
