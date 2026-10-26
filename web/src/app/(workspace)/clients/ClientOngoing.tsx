"use client";

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
// correctly side by side. Only work under way (Abhishek, 27 Oct 2026): being
// edited (or back for a revision), with us for approval, or with the client
// for theirs, and anything the team has in progress for the client. Queued
// or past the client, it's on the Task board tab.
const UNDER_WAY = new Set(["editing", "revision_requested", "sent_for_approval", "sent_for_client_approval"]);

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
  tasks = tasks.filter((t) => UNDER_WAY.has(t.status));
  workTasks = workTasks.filter((t) => t.status === "in_progress");
  if (tasks.length === 0 && workTasks.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-5 py-10 text-center">
        <p className="text-sm text-muted">Nothing being worked on for this client right now.</p>
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
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.key}>{r.row}</li>
      ))}
    </ul>
  );
}
