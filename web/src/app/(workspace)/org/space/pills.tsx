"use client";

import { pillStyle } from "@/lib/space";

// Quiet labels for a stage's name and a tag's name, all one look

export function StagePill({ name, color, className = "" }: { name: string; color: string; className?: string }) {
  return (
    <span style={pillStyle(color)} className={`inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}>
      <span className="truncate">{name}</span>
    </span>
  );
}

export function TagPill({ name, color, className = "", wrap = false }: { name: string; color: string; className?: string; wrap?: boolean }) {
  return (
    <span style={pillStyle(color)} className={`inline-flex max-w-full min-w-0 items-center rounded-md border px-1.5 text-[11.5px] leading-5 ${className}`}>
      <span className={wrap ? "break-words" : "truncate"}>{name}</span>
    </span>
  );
}
