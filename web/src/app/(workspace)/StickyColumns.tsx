"use client";

import { useId } from "react";
import { perRow } from "@/lib/perRow";

export type StickyColumn = { key: string; header: React.ReactNode; body: React.ReactNode };

// Board columns that always fit the window — never running off its right
// edge, whether the sidebar is open or not — and never stretch wider than a
// comfortable card when there are only a few of them.
//
// All of them fit at no less than `minColumn`: one row, with the headers in
// their own strip pinned to the top of the page while the cards scroll under
// it (the toolbar above just scrolls away). They don't: even rows, each
// column keeping its header pinned at the top of its own column instead.
//
// Decided by container queries rather than by measuring in JS, so the right
// layout is there on the very first paint — no six-in-a-row flash that then
// jumps into rows.
export function StickyColumns({
  columns,
  minColumn = 10,
  onDragOver,
}: {
  columns: StickyColumn[];
  // rem: the narrowest a column may get before the board wraps
  minColumn?: number;
  onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void;
}) {
  const scope = `sc${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const n = columns.length;

  const layout = (p: number) =>
    `.${scope}{--per-row:${p}}` +
    `.${scope} [data-strip]{display:${p >= n ? "block" : "none"}}` +
    `.${scope} [data-head]{display:${p >= n ? "none" : "block"}}` +
    `.${scope} [data-body]{row-gap:${p >= n ? 1 : 2}rem}`;
  let css = layout(perRow(0, n, minColumn));
  for (let f = 2, last = perRow(0, n, minColumn); f <= n; f++) {
    const width = f * (minColumn + 1) - 1; // the narrowest box that fits f
    const p = perRow(width, n, minColumn);
    if (p !== last) css += `@container (min-width:${width}rem){${layout(p)}}`;
    last = p;
  }

  // no wider than a comfortable card, scaled a little with the screen
  const grid = { gridTemplateColumns: "repeat(var(--per-row), minmax(0, clamp(16rem, 24vw, 22rem)))" };
  // A scroller's padding also pads where sticky things stop, so a plain
  // top-0 would pin headers a padding's height down the page with cards
  // showing above them. Pulling the stop up by the page padding
  // (--page-pad, set in the layout) pins them flush with the top.
  const pinned = "sticky top-[calc(-1*var(--page-pad,0px))] bg-background py-3";

  return (
    <div
      className="@container"
      onDragOver={(e) => {
        onDragOver?.(e);
        scrollPageNearEdge(e);
      }}
    >
      <style>{css}</style>
      <div className={scope}>
        <div data-strip className={`${pinned} z-20`}>
          <div className="grid gap-4" style={grid}>
            {columns.map((c) => (
              <div key={c.key} className="min-w-0">
                {c.header}
              </div>
            ))}
          </div>
        </div>
        <div data-body className="grid items-stretch gap-x-4 pb-4" style={grid}>
          {columns.map((c) => (
            <div key={c.key} className="flex min-w-0 flex-col">
              <div data-head className={`${pinned} z-10`}>
                {c.header}
              </div>
              {c.body}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const EDGE = 80;

// Dragging something near the top or bottom of the window scrolls the page
// (the app scrolls inside MainScroll, not the window, so the browser won't).
export function scrollPageNearEdge(e: React.DragEvent<HTMLElement>) {
  const page = e.currentTarget.closest<HTMLElement>("[data-scroll-root]");
  if (!page) return;
  const view = page.getBoundingClientRect();
  if (e.clientY < view.top + EDGE) page.scrollTop -= 18;
  else if (e.clientY > view.bottom - EDGE) page.scrollTop += 18;
}
