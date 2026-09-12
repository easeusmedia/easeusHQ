"use client";

import { TaskRow } from "../TaskRow";
import { ALL_STATUSES, type Role, type TaskStatus } from "@/lib/workflow";
import type { TaskCardData } from "../TaskCard";

// A flat list ordered by stage, with the stage named on every row — so
// "where is this one" is answerable without counting back to a heading,
// and any row opens the full task to edit.
export function ClientOngoing({
  tasks,
  clientName,
  editors,
  projects,
  actingUserId,
  actingRole,
}: {
  tasks: TaskCardData[];
  clientName: string;
  editors: { id: string; name: string }[];
  projects: { id: string; client: { name: string } }[];
  actingUserId: string;
  actingRole: Role;
}) {
  if (tasks.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-5 py-10 text-center">
        <p className="text-sm text-muted">Nothing in flight for this client right now.</p>
      </div>
    );
  }

  const order = (s: TaskStatus) => ALL_STATUSES.indexOf(s);
  const sorted = [...tasks].sort((a, b) => order(a.status) - order(b.status));

  return (
    <ul className="flex flex-col gap-2">
      {sorted.map((task) => (
        <li key={task.id}>
          <TaskRow
            task={task}
            clientName={clientName}
            subtitle={task.project.name || task.project.type}
            editors={editors}
            projects={projects}
            actingUserId={actingUserId}
            actingRole={actingRole}
          />
        </li>
      ))}
    </ul>
  );
}
