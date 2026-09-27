import { CircleCheck, Clapperboard, ListChecks, Receipt } from "lucide-react";

// The four numbers the daily client review actually asks for, big enough to
// read at a glance without opening anything. Everything else on the page is
// one tab away. Styled like the Contracts tiles: a soft glow and a small
// icon badge, lit when there's something there.
export function ClientStats({
  activeTasks,
  inProgress,
  completed,
  unpaid,
}: {
  activeTasks: number;
  inProgress: number;
  completed: number;
  unpaid: number;
}) {
  const stats = [
    { label: "Active tasks", value: activeTasks, lit: activeTasks > 0, Icon: ListChecks, tone: "accent" },
    { label: "Projects in progress", value: inProgress, lit: inProgress > 0, Icon: Clapperboard, tone: "accent" },
    { label: "Projects delivered", value: completed, lit: completed > 0, Icon: CircleCheck, tone: "emerald" },
    { label: "Unpaid", value: unpaid, lit: unpaid > 0, Icon: Receipt, tone: "accent" },
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map(({ label, value, lit, Icon, tone }) => (
        <div key={label} className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-surface/50 px-5 py-4">
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
          <p className="mt-1 text-xs text-muted">{label}</p>
        </div>
      ))}
    </div>
  );
}
