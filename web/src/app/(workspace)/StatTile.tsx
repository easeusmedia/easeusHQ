import type { LucideIcon } from "lucide-react";

// One number, the way every page shows it (first drawn for Contracts): big,
// with a small icon badge, and a soft glow when there's something there —
// blue, or green for what's done. Muted at zero.
export function StatTile({
  label,
  value,
  Icon,
  lit = typeof value === "number" ? value > 0 : true,
  tone = "accent",
  note,
}: {
  label: string;
  value: number | string;
  Icon: LucideIcon;
  lit?: boolean;
  tone?: "accent" | "emerald";
  // a line under the label — a change on the period before, say
  note?: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-surface/50 px-5 py-4">
      {lit && (
        <div
          className={`pointer-events-none absolute -right-8 -top-10 size-28 rounded-full bg-gradient-to-br to-transparent blur-2xl ${
            tone === "emerald" ? "from-emerald-400/20" : "from-accent/25"
          }`}
        />
      )}
      <span
        className={`absolute right-4 top-4 flex size-7 items-center justify-center rounded-lg ${
          !lit ? "bg-white/[0.04] text-muted" : tone === "emerald" ? "bg-emerald-400/15 text-emerald-300" : "bg-accent/15 text-accent"
        }`}
      >
        <Icon size={14} />
      </span>
      <p className={`text-3xl font-semibold tabular-nums tracking-tight ${lit ? "text-foreground" : "text-muted"}`}>{value}</p>
      <p className="mt-1 truncate pr-8 text-xs text-muted">{label}</p>
      {note && <div className="mt-2">{note}</div>}
    </div>
  );
}
