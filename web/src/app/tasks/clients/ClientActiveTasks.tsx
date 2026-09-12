"use client";

import { Avatar, StatusBadge } from "../TaskCard";
import type { TaskStatus } from "@/lib/workflow";

export type ActiveTask = {
  id: string;
  title: string;
  status: TaskStatus;
  projectType: string;
  assignee: string | null;
};

// The first thing anyone opening a client wants: what's in flight right now
// and what stage it's at. A flat labelled list, not the drag board — that
// lives under the Tasks tab for when someone actually wants to move work.
export function ClientActiveTasks({ tasks }: { tasks: ActiveTask[] }) {
  if (tasks.length === 0) {
    return <p className="text-sm text-muted">Nothing in flight — no active tasks for this client.</p>;
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {tasks.map((t) => (
        <li key={t.id} className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{t.title}</p>
            <p className="truncate text-xs text-muted">{t.projectType}</p>
          </div>
          {t.assignee && <Avatar name={t.assignee} size={22} />}
          <StatusBadge status={t.status} />
        </li>
      ))}
    </ul>
  );
}
