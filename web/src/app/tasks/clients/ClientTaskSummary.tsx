"use client";

// This has to be a client component: TaskCard.tsx (StatusBadge/Avatar
// live there) is itself "use client", and importing plain data/values
// from a client module into a server component doesn't work the way
// importing a component does — StatusBadge's colors came through as
// undefined every time until this file also crossed the client boundary.
import { StatusBadge, Avatar } from "../TaskCard";
import type { TaskStatus } from "@/lib/workflow";

type Task = { id: string; title: string; status: TaskStatus; assignedTo: { name: string } | null };

// A quick "what's currently going on" glance, right in Overview — the
// Tasks tab has the full interactive board (drag, status changes, links),
// this is just a flat read-only list so you don't have to switch tabs to
// see what's live for this client.
export function ClientTaskSummary({ tasks }: { tasks: Task[] }) {
  return (
    <section className="card-surface flex flex-col gap-3 rounded-xl p-4 shadow-sm">
      <h2 className="font-medium">Currently going</h2>
      {tasks.length === 0 ? (
        <p className="text-sm text-muted">Nothing active right now.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {tasks.map((t) => (
            <li key={t.id} className="flex items-center gap-2.5 rounded-md bg-surface-2 px-3 py-2 text-sm">
              {t.assignedTo ? <Avatar name={t.assignedTo.name} size={20} /> : <span className="h-5 w-5 shrink-0" />}
              <span className="min-w-0 flex-1 truncate">{t.title}</span>
              <StatusBadge status={t.status} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
