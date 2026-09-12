"use client";

import { useState, type ReactNode } from "react";

// Local state, not a URL param — this page doesn't need to be deep-linkable
// per tab, and it keeps the component trivial.
//
// Named "Tasks" here, not "Deliverables" — "Deliverables" is the
// contracted scope (2 podcast episodes/cycle, custom thumbnails), which
// now lives in the Overview tab; this tab is the day-to-day work queue.
export function ClientTabs({
  overview,
  tasks,
  billing,
}: {
  overview: ReactNode;
  tasks: ReactNode;
  billing: ReactNode;
}) {
  const [tab, setTab] = useState<"overview" | "tasks" | "billing">("overview");
  const tabDefs = [
    { key: "overview" as const, label: "Overview" },
    { key: "tasks" as const, label: "Tasks" },
    { key: "billing" as const, label: "Billing" },
  ];

  return (
    <div>
      <div className="mb-4 flex gap-1 border-b border-border">
        {tabDefs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t.key ? "border-foreground text-foreground" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {/* keep all three mounted, just hidden — the Board underneath has its
          own client-side state (drag, dialogs) that shouldn't reset every
          time you switch tabs */}
      <div hidden={tab !== "overview"}>{overview}</div>
      <div hidden={tab !== "tasks"}>{tasks}</div>
      <div hidden={tab !== "billing"}>{billing}</div>
    </div>
  );
}
