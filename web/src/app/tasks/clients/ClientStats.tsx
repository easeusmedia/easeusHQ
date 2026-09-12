// The four numbers the daily client review actually asks for, big enough to
// read at a glance without opening anything. Everything else on the page is
// one tab away.
export function ClientStats({
  activeTasks,
  delivered,
  projects,
  unpaid,
}: {
  activeTasks: number;
  delivered: number;
  projects: number;
  unpaid: number;
}) {
  const stats = [
    { label: "Active tasks", value: activeTasks, accent: activeTasks > 0 },
    { label: "Delivered", value: delivered, accent: false },
    { label: "Projects", value: projects, accent: false },
    { label: "Unpaid", value: unpaid, accent: unpaid > 0 },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="card-surface rounded-xl px-4 py-3 shadow-sm">
          <p className={`text-2xl font-semibold tabular-nums ${s.accent ? "text-foreground" : "text-muted"}`}>{s.value}</p>
          <p className="mt-0.5 text-xs text-muted">{s.label}</p>
        </div>
      ))}
    </div>
  );
}
