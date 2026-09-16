"use client";

import { useCallback, useEffect, useState } from "react";

// Where to draw a menu so its own container can't cut it off.
//
// An `absolute` menu is clipped by any ancestor with `overflow` — and this
// app is full of them: each board column scrolls its own cards, the work
// list clips its rounded corners, the task dialog scrolls its form. A status
// dropdown near the bottom of a column lost most of its options to that.
//
// `position: fixed` escapes overflow entirely. The catch is that a fixed
// element is positioned against the nearest *transformed* ancestor rather
// than the viewport, and every dialog here is centred with a translate — so
// coordinates are measured from that ancestor when there is one, and from
// the viewport when there isn't.
export type PopoverPosition = { top: number; left: number; width: number };

// Anything that makes itself the containing block for `position: fixed`
// descendants. `transform` is the famous one, but it is NOT the only one and
// checking it alone is a trap: Tailwind v4 centres dialogs with the separate
// `translate` property, whose computed `transform` reads "none" — so a menu
// inside a dialog measured against the viewport and landed a few hundred
// pixels away from its own trigger.
const CONTAINING_BLOCK_PROPS = ["transform", "translate", "rotate", "scale", "perspective", "filter", "backdropFilter"] as const;

function fixedContainingBlock(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
    const s = getComputedStyle(node);
    if (CONTAINING_BLOCK_PROPS.some((p) => s[p] !== "none")) return node;
    // `contain: paint/layout/strict` and `will-change` on those properties
    // do it too
    if (s.contain.includes("paint") || s.contain.includes("layout") || s.contain === "strict") return node;
    if (CONTAINING_BLOCK_PROPS.some((p) => s.willChange.includes(p))) return node;
  }
  return null;
}

export function usePopover(estimatedHeight: number) {
  const [position, setPosition] = useState<PopoverPosition | null>(null);

  const place = useCallback(
    (trigger: HTMLElement | null) => {
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      // flip above when there isn't room below and there is room above
      const below = window.innerHeight - rect.bottom;
      const flip = below < estimatedHeight && rect.top > below;
      // measured from the containing block's padding box, which is where a
      // fixed child's top/left actually resolve against
      const host = fixedContainingBlock(trigger);
      const hostRect = host?.getBoundingClientRect();
      const hostStyle = host ? getComputedStyle(host) : null;
      const baseTop = hostRect ? hostRect.top + parseFloat(hostStyle!.borderTopWidth || "0") : 0;
      const baseLeft = hostRect ? hostRect.left + parseFloat(hostStyle!.borderLeftWidth || "0") : 0;
      const top = flip ? rect.top - estimatedHeight - 4 : rect.bottom + 4;
      setPosition({ top: top - baseTop, left: rect.left - baseLeft, width: rect.width });
    },
    [estimatedHeight]
  );

  return { position, place, clear: () => setPosition(null) };
}

// A fixed-position menu doesn't move with the container it was opened from,
// so it has to close when that container scrolls — otherwise it hangs in
// space over whatever scrolled past underneath it.
export function useCloseOnScroll(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    // capture phase: the scroll happens on some inner container, and scroll
    // events don't bubble
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open, close]);
}
