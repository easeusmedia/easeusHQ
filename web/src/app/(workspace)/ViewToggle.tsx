"use client";

import { LayoutGrid, List } from "lucide-react";

export type View = "board" | "list";

// Board or List — the same segmented control wherever tasks can be shown
// either way (the Clients dashboard has its own copy of this pattern).
export function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <div className="flex w-fit gap-1 rounded-xl border border-border bg-surface/60 p-1">
      {([["board", LayoutGrid, "Board"], ["list", List, "List"]] as const).map(([key, Icon, label]) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          aria-label={`${key} view`}
          className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium ${
            view === key ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"
          }`}
        >
          <Icon size={15} /> {label}
        </button>
      ))}
    </div>
  );
}

// One control row: how to view on the left, whose work in the middle,
// anything else on the right. The middle stays centred on the page however
// wide the two sides are, which a plain justify-between row can't do.
export function Toolbar({
  left,
  center,
  right,
  className = "",
}: {
  left: React.ReactNode;
  center?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`grid shrink-0 items-center gap-3 sm:grid-cols-[1fr_auto_1fr] ${className}`}>
      <div className="flex flex-wrap items-center gap-2">{left}</div>
      <div className="sm:justify-self-center">{center}</div>
      <div className="flex items-center gap-2 sm:justify-self-end">{right}</div>
    </div>
  );
}
