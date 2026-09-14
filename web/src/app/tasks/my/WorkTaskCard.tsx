"use client";

import { useRef } from "react";
import { Link2, Paperclip } from "lucide-react";
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

  return (
    <>
      <button
        onClick={() => dialogRef.current?.open()}
        className="card-surface card-interactive flex flex-col gap-2 rounded-xl p-3 text-left shadow-sm"
      >
        {task.category && (
          <span className="w-fit rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-muted">
            {task.category}
          </span>
        )}
        <p className="text-sm font-medium leading-snug">{task.title}</p>
        {task.project && (
          <p className="truncate text-xs text-muted">
            {task.project.client.name} · {task.project.name}
          </p>
        )}

        <div className="mt-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[11px] text-muted">
            {task.links.length > 0 && (
              <span className="flex items-center gap-1">
                <Link2 size={11} /> {task.links.length}
              </span>
            )}
            {task.attachments.length > 0 && (
              <span className="flex items-center gap-1">
                <Paperclip size={11} /> {task.attachments.length}
              </span>
            )}
            {task.dueDate && (
              <span className={overdue ? "font-medium text-red-300" : ""}>{shortDate(task.dueDate)}</span>
            )}
          </div>
          {showAssignee && <Avatar name={task.assignedTo.name} size={20} />}
        </div>
      </button>

      <WorkTaskDialog ref={dialogRef} mode="edit" task={task} projects={projects} actingUserId={actingUserId} />
    </>
  );
}
