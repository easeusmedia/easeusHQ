"use client";

import { useRef } from "react";
import { CalendarClock, Link2, Paperclip } from "lucide-react";
import type { WorkTaskStatus } from "@prisma/client";
import { Avatar } from "../TaskCard";
import { WorkTaskDialog } from "./WorkTaskDialog";
import type { WorkTaskLink, WorkTaskAttachment } from "./actions";

export type WorkTaskCardData = {
  id: string;
  title: string;
  notes: string | null;
  status: WorkTaskStatus;
  category: string | null;
  dueDate: string | null;
  sortOrder: number;
  links: WorkTaskLink[];
  attachments: WorkTaskAttachment[];
  projectId: string | null;
  project: { name: string; client: { name: string } } | null;
  assignedTo: { id: string; name: string };
  createdBy: { id: string; name: string };
};

type Project = { id: string; name: string; client: { name: string } };

// DD/MM/YYYY, same convention as the client task board (TaskCard.formatDate)
// — dueDate here is already a plain yyyy-mm-dd string (see page.tsx), so no
// timezone shifting is needed the way that one does for a real Date.
function shortDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function WorkTaskCard({
  task,
  projects,
  showAssignee,
  actingUserId,
}: {
  task: WorkTaskCardData;
  projects: Project[];
  showAssignee: boolean;
  actingUserId: string;
}) {
  const dialogRef = useRef<{ open: () => void }>(null);
  const overdue = !!task.dueDate && task.status !== "done" && task.dueDate < new Date().toISOString().slice(0, 10);
  const hasFooter = task.dueDate || task.links.length > 0 || task.attachments.length > 0 || showAssignee;

  return (
    <>
      <button
        onClick={() => dialogRef.current?.open()}
        className="card-surface card-interactive flex w-full flex-col gap-2.5 rounded-xl p-4 text-left shadow-sm"
      >
        {task.category && (
          <span className="w-fit rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium text-muted">
            {task.category}
          </span>
        )}
        <p className="text-sm font-medium leading-snug">{task.title}</p>
        {task.project && (
          <p className="truncate text-xs text-muted">
            {task.project.client.name} · {task.project.name}
          </p>
        )}

        {hasFooter && (
          <div className="mt-1 flex items-center justify-between gap-2 border-t border-border pt-2.5">
            <div className="flex min-w-0 items-center gap-3 text-xs text-muted">
              {task.dueDate && (
                <span className={`flex items-center gap-1 ${overdue ? "font-medium text-red-300" : ""}`}>
                  <CalendarClock size={13} /> {shortDate(task.dueDate)}
                </span>
              )}
              {task.links.length > 0 && (
                <span className="flex items-center gap-1">
                  <Link2 size={13} /> {task.links.length}
                </span>
              )}
              {task.attachments.length > 0 && (
                <span className="flex items-center gap-1">
                  <Paperclip size={13} /> {task.attachments.length}
                </span>
              )}
            </div>
            {showAssignee && <Avatar name={task.assignedTo.name} size={24} />}
          </div>
        )}
      </button>

      <WorkTaskDialog ref={dialogRef} mode="edit" task={task} projects={projects} actingUserId={actingUserId} />
    </>
  );
}
