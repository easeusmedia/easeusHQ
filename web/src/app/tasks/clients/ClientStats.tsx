// The four numbers the daily client review actually asks for, big enough to
// read at a glance without opening anything. Everything else on the page is
// one tab away.
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
    { label: "Active tasks", value: activeTasks, accent: activeTasks > 0 },
    { label: "Projects in progress", value: inProgress, accent: inProgress > 0 },
    { label: "Projects delivered", value: completed, accent: false },
    { label: "Unpaid", value: unpaid, accent: unpaid > 0 },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="card-surface rounded-2xl px-5 py-4 shadow-sm">
          <p className={`text-2xl font-semibold tabular-nums ${s.accent ? "text-foreground" : "text-muted"}`}>{s.value}</p>
          <p className="mt-0.5 text-xs text-muted">{s.label}</p>
        </div>
      ))}
    </div>
  );
}
