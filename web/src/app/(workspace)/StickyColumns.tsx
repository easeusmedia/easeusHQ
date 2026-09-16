"use client";

import { useRef } from "react";

// A row of board columns whose headers stay pinned to the top of the page
// while the cards scroll under them.
//
// The page itself is the scroller (MainScroll), so the toolbar above a board
// simply scrolls away and only the column headers stay. The catch is
// sideways scrolling: a sticky header can't sit inside a sideways-scrolling
// box and still stick to the page, so the headers get their own strip, laid
// out on the same column widths, that follows the columns' sideways scroll.
//
// Every column stretches to the tallest one, so a card can be dropped
// anywhere down any column, however short it is.
export function StickyColumns({
  headers,
  children,
  minColumn = "16rem",
  onDragOver,
}: {
  headers: React.ReactNode[];
  // one element per column, in the same order as `headers`
  children: React.ReactNode;
  minColumn?: string;
  onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void;
}) {
  const head = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const columns = { gridTemplateColumns: `repeat(${headers.length}, minmax(${minColumn}, 1fr))` };

  // Dragging a card near an edge scrolls: sideways within the board, up and
  // down the page.
  function edgeScroll(e: React.DragEvent<HTMLDivElement>) {
    const edge = 80;
    const box = e.currentTarget.getBoundingClientRect();
    if (e.clientX < box.left + edge) e.currentTarget.scrollLeft -= 18;
    else if (e.clientX > box.right - edge) e.currentTarget.scrollLeft += 18;

    const page = e.currentTarget.closest<HTMLElement>("[data-scroll-root]");
    if (!page) return;
    const view = page.getBoundingClientRect();
    if (e.clientY < view.top + edge) page.scrollTop -= 18;
    else if (e.clientY > view.bottom - edge) page.scrollTop += 18;
  }

  return (
    <div>
      {/* A scroller's padding also pads where sticky things stop, so a plain
          top-0 would pin the headers a padding's height down the page with
          cards showing above them. Pulling the stop up by the page padding
          (--page-pad, set in the layout) pins them flush with the top. */}
      <div className="sticky top-[calc(-1*var(--page-pad,0px))] z-20 bg-background py-3">
        <div
          ref={head}
          // a sideways swipe over the headers moves the columns too
          onWheel={(e) => {
            if (body.current && e.deltaX) body.current.scrollLeft += e.deltaX;
          }}
          className="overflow-hidden"
        >
          <div className="grid gap-4" style={columns}>
            {headers}
          </div>
        </div>
      </div>
      <div
        ref={body}
        onScroll={(e) => {
          if (head.current) head.current.scrollLeft = e.currentTarget.scrollLeft;
        }}
        onDragOver={(e) => {
          onDragOver?.(e);
          edgeScroll(e);
        }}
        className="overflow-x-auto pb-4"
      >
        <div className="grid items-stretch gap-4" style={columns}>
          {children}
        </div>
      </div>
    </div>
  );
}
