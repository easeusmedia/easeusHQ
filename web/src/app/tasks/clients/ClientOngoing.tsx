"use client";

import { Avatar } from "../TaskCard";
import { ALL_STATUSES, type TaskStatus } from "@/lib/workflow";
import { STAGE } from "@/lib/stages";

export type OngoingTask = {
  id: string;
  title: string;
  status: TaskStatus;
  projectName: string;
  assignee: string | null;
};

// Grouped by stage, in workflow order, so the answer to "where is
// everything for this client right now" is the shape of the list itself —
// not something you have to read six status pills to work out.
export function ClientOngoing({ tasks }: { tasks: OngoingTask[] }) {
  if (tasks.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-5 py-8 text-center">
        <p className="text-sm text-muted">Nothing in flight for this client right now.</p>
      </div>
    );
  }

  const stages = ALL_STATUSES.filter((s) => s !== "delivered_and_uploaded")
    .map((status) => ({ status, items: tasks.filter((t) => t.status === status) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col gap-5">
      {stages.map((group) => (
        <div key={group.status}>
          <div className="mb-2 flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${STAGE[group.status].dot}`} />
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted">{STAGE[group.status].label}</h3>
            <span className="text-xs text-muted/70">{group.items.length}</span>
          </div>
          <ul className="flex flex-col gap-1.5">
            {group.items.map((t) => (
              <li key={t.id} className="flex items-center gap-3 rounded-xl bg-surface-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{t.title}</p>
                  <p className="truncate text-xs text-muted">{t.projectName}</p>
                </div>
                {t.assignee && <Avatar name={t.assignee} size={22} />}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
