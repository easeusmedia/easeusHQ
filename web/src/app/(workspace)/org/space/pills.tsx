"use client";

import { PILL_STYLE, toneOf } from "@/lib/space";

// A stage's badge and a tag's label

// A stage, as the task board's status badge
export function StagePill({ name, color, className = "" }: { name: string; color: string; className?: string }) {
  return <span className={`status-pop inline-flex max-w-full min-w-0 shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${toneOf(color).pill} ${className}`}><span className="truncate">{name}</span></span>;
}

export function TagPill({ name, className = "", wrap = false }: { name: string; color?: string; className?: string; wrap?: boolean }) {
  return (
    <span style={PILL_STYLE} className={`inline-flex max-w-full min-w-0 items-center rounded-md border px-1.5 text-[11.5px] leading-5 ${className}`}>
      <span className={wrap ? "break-words" : "truncate"}>{name}</span>
    </span>
  );
}
