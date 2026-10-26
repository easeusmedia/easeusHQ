"use client";

import { useLayoutEffect, useRef } from "react";

// Where a dragged card will land: a dashed slot of its size, as on the
// Production and Sales boards, while the cards around it ease aside to make
// room (Abhishek, 27 Oct 2026). `row`: one row of a list, an <li>.
export function DropSlot({ height, row = false }: { height: number; row?: boolean }) {
  const Tag = row ? "li" : "div";
  return (
    <Tag
      aria-hidden
      style={{ height: height || 56 }}
      className={`fade-in shrink-0 border border-dashed border-white/15 bg-white/[0.03] ${row ? "" : "rounded-xl"}`}
    />
  );
}

// Where among `cards` (the dragged one left out) a pointer at x, y lands:
// reading across a grid, before the first card it's above, or level with
// and short of the middle of; down a list (`across` false), before the first
// whose middle it's above. Measured from the layout, not the screen, so
// cards still easing aside can't make the slot flicker. `container` is the
// cards' positioned parent.
export function landingIndex(container: HTMLElement, cards: HTMLElement[], x: number, y: number, across: boolean) {
  const box = container.getBoundingClientRect();
  const px = x - box.left;
  const py = y - box.top;
  const i = cards.findIndex((el) =>
    across
      ? py < el.offsetTop || (py < el.offsetTop + el.offsetHeight && px < el.offsetLeft + el.offsetWidth / 2)
      : py < el.offsetTop + el.offsetHeight / 2
  );
  return i < 0 ? cards.length : i;
}

// The children of `ref` glide to where they now sit whenever `order` (what's
// listed, and where the slot is) changes: the slot coming, going or moving
// on, a card dropped into place. Only then, so a window resized earlier
// never sets them gliding later. None when the system asks for less motion.
export function useEaseAside(ref: React.RefObject<HTMLElement | null>, order: string) {
  const seen = useRef({ order, at: new WeakMap<Element, { x: number; y: number }>() });
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const moved = seen.current.order !== order;
    seen.current.order = order;
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const el of box.children) {
      if (!(el instanceof HTMLElement)) continue;
      const was = seen.current.at.get(el);
      const now = { x: el.offsetLeft, y: el.offsetTop };
      seen.current.at.set(el, now);
      if (!was || !moved || calm || (was.x === now.x && was.y === now.y)) continue;
      // from where it shows now, mid-glide or still
      const shown = new DOMMatrix(getComputedStyle(el).transform);
      el.animate(
        [{ transform: `translate(${was.x + shown.e - now.x}px, ${was.y + shown.f - now.y}px)` }, { transform: "none" }],
        { duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
      );
    }
  });
}
