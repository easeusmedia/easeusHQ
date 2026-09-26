"use client";

import { Minus, Plus } from "lucide-react";

// − 30 + : no native spinner arrows, and never outside min…max
export function Stepper({
  value,
  max,
  min = 1,
  onChange,
}: {
  value: number;
  max: number;
  min?: number;
  onChange: (n: number) => void;
}) {
  const set = (n: number) => onChange(Math.min(max, Math.max(min, Math.round(n) || min)));
  const step = "grid h-8 w-8 place-items-center text-muted transition-colors hover:text-foreground disabled:opacity-30";
  return (
    <span className="inline-flex items-center rounded-lg bg-surface-2">
      <button type="button" aria-label="Less" onClick={() => set(value - 1)} disabled={value <= min} className={step}>
        <Minus size={13} />
      </button>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => set(Number(e.target.value))}
        onFocus={(e) => e.target.select()}
        className="w-9 bg-transparent text-center text-sm font-medium tabular-nums outline-none! [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button type="button" aria-label="More" onClick={() => set(value + 1)} disabled={value >= max} className={step}>
        <Plus size={13} />
      </button>
    </span>
  );
}
