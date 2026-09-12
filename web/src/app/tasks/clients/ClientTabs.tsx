"use client";

import { useState, type ReactNode } from "react";

export type Tab = {
  key: string;
  label: string;
  count?: number;
  content: ReactNode;
  // the task board needs the full page width — capping it to the reading
  // column left the first and last columns sliced in half — and it manages
  // its own scrolling rather than growing the page
  bleed?: boolean;
};

// Local state, not a URL param — this page doesn't need to be deep-linkable
// per tab. All panes stay mounted and are only hidden, because the Board
// underneath has client-side state (drag, dialogs) that shouldn't reset
// every time you switch tabs.
export function ClientTabs({ tabs, width }: { tabs: Tab[]; width: string }) {
  const [active, setActive] = useState(tabs[0].key);

  // The page itself doesn't scroll: this fills whatever height is left and
  // each pane scrolls inside it. That's what keeps the board's stage
  // headers pinned — they sit above the part that actually scrolls, so
  // tasks move past them instead of carrying them off the top of the page.
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={`mb-6 flex shrink-0 gap-1 overflow-x-auto border-b border-border ${width}`}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${
              active === t.key ? "border-foreground text-foreground" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] tabular-nums text-muted">{t.count}</span>
            )}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div
          key={t.key}
          hidden={active !== t.key}
          className={t.bleed ? "flex min-h-0 flex-1 flex-col" : `min-h-0 flex-1 overflow-y-auto pb-2 ${width}`}
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
