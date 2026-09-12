"use client";

import { useState } from "react";
import { CalendarDays, ExternalLink, Layers } from "lucide-react";

export type WorkItemData = {
  id: string;
  title: string;
  status: string;
  batch: string | null;
  link: string | null;
  invoiceStatus: string | null;
  completedAt: string; // pre-formatted on the server — no locale drift on hydration
};

function Pill({ tone, children }: { tone: "green" | "amber" | "neutral" | "blue"; children: React.ReactNode }) {
  const tones = {
    green: "bg-green-400/15 text-green-300 border-green-400/30",
    amber: "bg-amber-400/15 text-amber-300 border-amber-400/30",
    blue: "bg-blue-400/15 text-blue-300 border-blue-400/30",
    neutral: "bg-surface text-muted border-border",
  };
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}

// The track record — every episode/video actually shipped for this client,
// newest first. Distinct from Tasks (the live queue) and Deliverables (the
// contracted scope): this is "what have we done for them so far", the
// question the daily client review actually opens with.
export function ClientWork({ items }: { items: WorkItemData[] }) {
  const batches = Array.from(new Set(items.map((i) => i.batch).filter(Boolean))) as string[];
  const [batch, setBatch] = useState<string | null>(null);
  const shown = batch ? items.filter((i) => i.batch === batch) : items;

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted">
        Nothing delivered yet — finished episodes and videos land here once the client&apos;s Notion database is synced.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {batches.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setBatch(null)}
            className={`rounded-full border px-2.5 py-1 text-xs ${batch === null ? "border-border bg-surface-2 text-foreground" : "border-transparent text-muted hover:bg-surface-2"}`}
          >
            All ({items.length})
          </button>
          {batches.map((b) => (
            <button
              key={b}
              onClick={() => setBatch(b)}
              className={`rounded-full border px-2.5 py-1 text-xs ${batch === b ? "border-border bg-surface-2 text-foreground" : "border-transparent text-muted hover:bg-surface-2"}`}
            >
              {b}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((item) => (
          <article key={item.id} className="card-surface flex flex-col gap-3 rounded-xl p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <h3 className="min-w-0 text-sm font-medium leading-snug">{item.title}</h3>
              <Pill tone={item.status === "completed" ? "green" : "blue"}>
                {item.status === "completed" ? "Completed" : "In progress"}
              </Pill>
            </div>

            <div className="mt-auto flex flex-col gap-1.5 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <CalendarDays size={13} /> {item.completedAt}
              </span>
              {item.batch && (
                <span className="flex items-center gap-1.5">
                  <Layers size={13} /> {item.batch}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 border-t border-border/50 pt-2.5">
              {item.invoiceStatus && (
                <Pill tone={item.invoiceStatus === "paid" ? "green" : "amber"}>
                  {item.invoiceStatus === "paid" ? "Paid" : "Unpaid"}
                </Pill>
              )}
              {item.link && (
                <a
                  href={item.link}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto flex items-center gap-1 text-xs text-muted hover:text-foreground"
                >
                  Files <ExternalLink size={12} />
                </a>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
