"use client";

import { useRef } from "react";
import { Avatar, StatusBadge, type TaskCardData } from "./TaskCard";
import { TaskDetailsDialog } from "./TaskDetailsDialog";
import type { Role } from "@/lib/workflow";

// One task as a list row — the same click-to-open-details behaviour the
// board cards have, so a task is editable everywhere it's shown rather
// than only on the board.
export function TaskRow({
  task,
  clientName,
  subtitle,
  editors,
  projects,
  actingUserId,
  actingRole,
}: {
  task: TaskCardData;
  clientName: string;
  subtitle: string;
  editors: { id: string; name: string }[];
  projects: { id: string; client: { name: string } }[];
  actingUserId: string;
  actingRole: Role;
}) {
  const detailsRef = useRef<{ open: () => void }>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => detailsRef.current?.open()}
        className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-surface-2/40 px-4 py-3 text-left hover:bg-surface-2"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{task.title}</span>
          <span className="block truncate text-xs text-muted">{subtitle}</span>
        </span>
        {task.assignedTo && <Avatar name={task.assignedTo.name} size={22} />}
        <StatusBadge status={task.status} />
      </button>

      <TaskDetailsDialog
        ref={detailsRef}
        task={task}
        clientName={clientName}
        editors={editors}
        projects={projects}
        actingUserId={actingUserId}
        actingRole={actingRole}
      />
    </>
  );
}
