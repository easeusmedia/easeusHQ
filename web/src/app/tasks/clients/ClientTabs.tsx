"use client";

import { useState, type ReactNode } from "react";
import { paramOrProp, setParam } from "../urlState";

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

// The open tab lives in the URL (?tab=), because otherwise opening a project
// from here and pressing Back dropped you on the client page with the tab
// snapped back to Overview — you "came back" somewhere you'd never been.
// The server reads the param and hands it in as initialTab, so the first
// paint is already the right pane (no hydration flash).
//
// Switching uses replaceState rather than router.push: a tab switch isn't a
// place you should have to press Back through, but the URL still has to be
// current at the moment you navigate away, so Back can restore it. All panes
// stay mounted and are only hidden — the Board underneath has client-side
// state (drag, dialogs) that shouldn't reset every time you switch tabs.
export function ClientTabs({ tabs, width, initialTab }: { tabs: Tab[]; width: string; initialTab?: string }) {
  const [active, setActive] = useState(() => {
    const want = paramOrProp("tab", initialTab);
    return tabs.find((t) => t.key === want)?.key ?? tabs[0].key;
  });

  function select(key: string) {
    setActive(key);
    setParam("tab", key === tabs[0].key ? null : key);
  }

  return (
    <div>
      <div className={`mb-6 flex gap-1 overflow-x-auto border-b border-border ${width}`}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => select(t.key)}
            className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${
              active === t.key ? "border-foreground text-foreground" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-xs tabular-nums text-muted">{t.count}</span>
            )}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.key} hidden={active !== t.key} className={t.bleed ? undefined : width}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
