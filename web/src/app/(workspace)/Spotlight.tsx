"use client";

import { useEffect } from "react";

// Clickable cards light up where the pointer is: a soft blue glow that
// follows it across the card, and the card's edge brightening nearest it
// (globals.css, --spot). This tells the card under the pointer where that
// is, once a frame at most.
export function Spotlight() {
  useEffect(() => {
    let frame = 0;
    let last: PointerEvent | null = null;
    const apply = () => {
      frame = 0;
      const card = last && (last.target as Element | null)?.closest?.<HTMLElement>(".panel-hover, .card-interactive");
      if (!last || !card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${last.clientX - r.left}px`);
      card.style.setProperty("--my", `${last.clientY - r.top}px`);
    };
    const move = (e: PointerEvent) => {
      last = e;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => {
      window.removeEventListener("pointermove", move);
      cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
