"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Link2, Paperclip } from "lucide-react";
import type { WorkTaskStatus } from "@prisma/client";
import { WORK_TASK_STAGE, WORK_TASK_STATUSES } from "@/lib/workTaskStages";
import { Dropdown } from "../Dropdown";
import { moveWorkTask } from "./actions";
import { Avatar } from "../TaskCard";
import { WorkTaskDialog } from "./WorkTaskDialog";
import { TaskTagChip } from "../TaskTagPicker";
import type { TaskTagOption } from "../TaskTagPicker";
import type { WorkTaskLink, WorkTaskAttachment } from "./actions";

export type WorkTaskCardData = {
  id: string;
  title: string;
  notes: string | null;
  status: WorkTaskStatus;
  // the free-text label this used to carry; kept on the type so old rows
  // still render, but tags are what new work is labelled with
  category: string | null;
  tags: { id: string; name: string }[];
  dueDate: string | null;
  sortOrder: number;
  links: WorkTaskLink[];
  attachments: WorkTaskAttachment[];
  projectId: string | null;
  project: { name: string; client: { name: string } } | null;
  assignedTo: { id: string; name: string; team?: { slug: string; name: string } | null };
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
  showStatus = false,
  assignees = [],
  taskTags = [],
  canManageTags = false,
  actingUserId,
}: {
  task: WorkTaskCardData;
  projects: Project[];
  showAssignee: boolean;
  // on a board grouped by person or team the column no longer says what
  // stage a task is at, so the card does — as a dropdown that moves it
  showStatus?: boolean;
  assignees?: { id: string; name: string }[];
  taskTags?: TaskTagOption[];
  canManageTags?: boolean;
  actingUserId: string;
}) {
  const dialogRef = useRef<{ open: () => void }>(null);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const overdue = !!task.dueDate && task.status !== "done" && task.dueDate < new Date().toISOString().slice(0, 10);
  const hasFooter = task.dueDate || task.links.length > 0 || task.attachments.length > 0 || showAssignee;

  return (
    <>
      {/* a div, not a button: with the status dropdown inside it, a button
          would be one control nested in another */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => dialogRef.current?.open()}
        onKeyDown={(e) => e.key === "Enter" && dialogRef.current?.open()}
        className="card-surface card-interactive flex w-full cursor-pointer flex-col gap-2.5 rounded-xl p-4 text-left shadow-sm"
      >
        {showStatus && (
          <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} className="w-full max-w-40">
            {/* keyed on status so it shows the saved stage after a refresh */}
            <Dropdown
              key={task.status}
              size="sm"
              defaultValue={task.status}
              options={WORK_TASK_STATUSES.map((s) => ({ value: s, label: WORK_TASK_STAGE[s].label }))}
              onChange={async (v) => {
                setError(null);
                const res = await moveWorkTask(task.id, v as WorkTaskStatus, task.sortOrder);
                if (res.error) setError(res.error);
                else router.refresh();
              }}
            />
          </span>
        )}
        {error && <p className="text-xs text-red-300">{error}</p>}
        {(task.tags.length > 0 || task.category) && (
          <span className="flex w-fit flex-wrap items-center gap-1">
            {task.tags.map((t) => (
              <TaskTagChip key={t.id} name={t.name} />
            ))}
            {/* rows created before tags existed still carry a free-text
                category — shown so nothing silently disappears */}
            {task.tags.length === 0 && task.category && <TaskTagChip name={task.category} />}
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
            {/* Name, not just a circle. An initial alone doesn't say who has
                the task, and on a board scoped to a whole team "who is on
                this" is the main thing the card has to answer. It leads the
                row; the counts and the date sit after it. */}
            {showAssignee ? (
              <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs">
                <Avatar name={task.assignedTo.name} size={20} />
                <span className="truncate text-foreground">{task.assignedTo.name}</span>
              </span>
            ) : (
              <span className="flex-1" />
            )}
            <div className="flex shrink-0 items-center gap-3 text-xs text-muted">
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
          </div>
        )}
      </div>

      <WorkTaskDialog ref={dialogRef} mode="edit" task={task} projects={projects} actingUserId={actingUserId} assignees={assignees} taskTags={taskTags} canManageTags={canManageTags} />
    </>
  );
}
