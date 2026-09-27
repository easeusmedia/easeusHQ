import type { LucideIcon } from "lucide-react";

// One number, the way every page shows it: big, with a small icon badge —
// lit when there's something there (green for what's done), muted at zero.
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
    <div className="relative panel rounded-2xl px-5 py-4">
      <span
        className={`absolute right-4 top-4 flex size-7 items-center justify-center rounded-lg ${
          !lit ? "badge" : tone === "emerald" ? "badge-lit emerald" : "badge-lit"
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
