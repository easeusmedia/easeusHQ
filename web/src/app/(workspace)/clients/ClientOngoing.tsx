"use client";

import { useState } from "react";
import { TaskRow } from "../TaskRow";
import { ALL_STATUSES, type Role, type TaskStatus } from "@/lib/workflow";
import type { TaskCardData } from "../TaskCard";
import type { TaskTagOption } from "../TaskTagPicker";
import { WorkTaskRow, type ClientWorkTask } from "./ClientWorkTasks";

// Everything in flight for this client, in one list.
//
// Two systems feed it — the client editing queue and the team's own work
// tasks — and they were briefly shown as two separate sections. That was the
// wrong cut: from a client's page the question is "what is happening for
// this client", and which internal board a job happens to live on isn't part
// of the answer. Each row carries its own stage, so the two still read
// correctly side by side. Five at a time, Show more for the next five
// (Abhishek, 27 Oct 2026).
const PAGE = 5;

export function ClientOngoing({
  tasks,
  workTasks = [],
  clientName,
  editors,
  projects,
  actingUserId,
  actingRole,
  taskTags = [],
}: {
  tasks: TaskCardData[];
  workTasks?: ClientWorkTask[];
  clientName: string;
  editors: { id: string; name: string }[];
  projects: { id: string; name: string; client: { id: string; name: string } }[];
  actingUserId: string;
  actingRole: Role;
  taskTags?: TaskTagOption[];
}) {
  const [shown, setShown] = useState(PAGE);
  if (tasks.length === 0 && workTasks.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-5 py-10 text-center">
        <p className="text-sm text-muted">No work in progress for this client right now.</p>
      </div>
    );
  }

  const order = (s: TaskStatus) => ALL_STATUSES.indexOf(s);
  const sorted = [...tasks].sort((a, b) => order(a.status) - order(b.status));

  // the team's own work on this client after it, in the same list rather
  // than a section of its own: see the comment above the component
  const rows = [
    ...sorted.map((task) => ({
      key: task.id,
      row: (
        <TaskRow
          task={task}
          clientName={clientName}
          subtitle={task.project.name || task.project.type}
          editors={editors}
          projects={projects}
          actingUserId={actingUserId}
          actingRole={actingRole}
          taskTags={taskTags}
        />
      ),
    })),
    ...workTasks.map((t) => ({ key: `work-${t.id}`, row: <WorkTaskRow task={t} /> })),
  ];

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {rows.slice(0, shown).map((r, i) => (
          // the ones a Show more adds ease in
          <li key={r.key} className={i >= PAGE ? "fade-in" : undefined}>
            {r.row}
          </li>
        ))}
      </ul>
      {rows.length > shown && (
        <button type="button" onClick={() => setShown((n) => n + PAGE)} className="self-center px-2 py-1 text-sm text-muted transition-colors hover:text-foreground">
          Show more
        </button>
      )}
    </div>
  );
}
