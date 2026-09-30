import type { Letter } from "@/lib/videoScore";

// Each letter's colours: gold for S, green for A+, the accent for A, then
// quieter down to D. A plain module, so server pages and client
// components can both read it (a value exported from a "use client" file
// reaches a server component as a reference, not the value).
export const GRADE_STYLE: Record<Letter, string> = {
  S: "bg-amber-300/15 text-amber-200 ring-1 ring-amber-300/40",
  "A+": "bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/35",
  A: "bg-accent/15 text-accent",
  B: "bg-foreground/[0.08] text-foreground/85",
  C: "bg-orange-300/10 text-orange-300",
  D: "bg-rose-300/10 text-rose-300",
};
