"use client";

import { Check } from "lucide-react";

// A checkbox that belongs to this app rather than the browser's own grey
// square, which is what `accent-*` on a bare <input> gets you: a light-mode
// control sitting in a dark interface, the one thing on the row that looks
// like it came from somewhere else.
//
// Still a real <input> underneath — keyboard, focus and screen readers work
// exactly as they would without any of this. The box people see is the span
// beside it, driven by the input's own :checked state, and the tick fades
// and scales in rather than appearing all at once.
export function Checkbox({
  checked,
  onChange,
  label,
  size = 16,
  className = "",
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  // what it's for, read aloud — the visible text is usually beside it
  label: string;
  size?: number;
  className?: string;
}) {
  return (
    <span className={`relative inline-flex shrink-0 items-center ${className}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
        className="peer absolute inset-0 z-10 m-0 cursor-pointer opacity-0"
      />
      <span
        style={{ width: size, height: size }}
        aria-hidden
        // The tick is always there and always the right size; it just
        // has no colour until it's ticked, which is what fades it in.
        // Hover only touches the border — a hover *background* sits at the
        // same specificity as the checked fill and wins while the cursor is
        // on it, so a box you had just ticked went back to looking empty.
        className="flex items-center justify-center rounded-[5px] border border-foreground/25 bg-transparent text-transparent transition-colors duration-200 ease-out peer-hover:border-foreground/60 peer-focus-visible:border-foreground/60 peer-focus-visible:ring-2 peer-focus-visible:ring-foreground/20 peer-checked:border-foreground peer-checked:bg-foreground peer-checked:text-background"
      >
        <Check size={Math.round(size * 0.7)} strokeWidth={3.5} />
      </span>
    </span>
  );
}
