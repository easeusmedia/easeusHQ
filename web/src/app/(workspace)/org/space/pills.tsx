"use client";

import { Check } from "lucide-react";
import { COLOR_NAMES, hexOf, pillStyle } from "@/lib/space";

// Notion's tinted labels: a stage's name, a tag's name. Colours are names
// from lib/space COLORS, drawn with inline styles.

export function StagePill({ name, color, className = "" }: { name: string; color: string; className?: string }) {
  return (
    <span style={pillStyle(color)} className={`inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}>
      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: hexOf(color) }} />
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

export function ColorDot({ color, size = 8 }: { color: string; size?: number }) {
  return <span className="shrink-0 rounded-full" style={{ width: size, height: size, backgroundColor: hexOf(color) }} />;
}

// The ten colours to pick from, as swatches
export function ColorPicker({ value, onPick }: { value: string; onPick: (color: string) => void }) {
  return (
    <div className="grid grid-cols-5 gap-1.5 p-1">
      {COLOR_NAMES.map((c) => (
        <button
          key={c}
          type="button"
          title={c === "default" ? "Default" : c[0].toUpperCase() + c.slice(1)}
          aria-label={c}
          aria-pressed={value === c}
          onClick={() => onPick(c)}
          className="flex size-7 items-center justify-center rounded-lg border transition-transform hover:scale-110"
          style={{ backgroundColor: `${hexOf(c)}33`, borderColor: `${hexOf(c)}66` }}
        >
          {value === c && <Check size={13} style={{ color: hexOf(c) }} />}
        </button>
      ))}
    </div>
  );
}
