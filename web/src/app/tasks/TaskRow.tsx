"use client";

import { useRef } from "react";
import { ExternalLink } from "lucide-react";
import { Avatar, StatusBadge, type TaskCardData } from "./TaskCard";
import { TaskDetailsDialog } from "./TaskDetailsDialog";
import { STAGE } from "@/lib/stages";
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

  // whichever link matters at this stage — the same one the board card
  // shows. Openable straight from the row, so checking a cut doesn't mean
  // opening the task first.
  const spec = STAGE[task.status].link;
  const href = task[spec.field];

  return (
    <>
      <div
        onClick={() => detailsRef.current?.open()}
        className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-border/60 bg-surface-2/40 px-4 py-3 text-left hover:bg-surface-2"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{task.title}</span>
          <span className="block truncate text-xs text-muted">{subtitle}</span>
        </span>

        {href && (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            // the row itself opens the task; this opens the file instead
            onClick={(e) => e.stopPropagation()}
            className="flex shrink-0 items-center gap-1 text-xs text-blue-400 hover:underline"
          >
            {spec.label} <ExternalLink size={11} />
          </a>
        )}

        {task.assignedTo && <Avatar name={task.assignedTo.name} size={22} />}
        <StatusBadge status={task.status} />
      </div>

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
