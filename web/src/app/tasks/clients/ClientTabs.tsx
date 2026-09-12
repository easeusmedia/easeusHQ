"use client";

import { useState, type ReactNode } from "react";

export type Tab = { key: string; label: string; count?: number; content: ReactNode };

// Local state, not a URL param — this page doesn't need to be deep-linkable
// per tab. All panes stay mounted and are only hidden, because the Board
// underneath has client-side state (drag, dialogs) that shouldn't reset
// every time you switch tabs.
export function ClientTabs({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(tabs[0].key);

  return (
    <div>
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
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
        <div key={t.key} hidden={active !== t.key}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
