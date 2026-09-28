"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CheckCircle2, Link2, Paperclip } from "lucide-react";
import type { WorkTaskStatus } from "@prisma/client";
import { ACTIVE_WORK_STATUSES, WORK_TASK_STAGE } from "@/lib/workTaskStages";
import { Dropdown } from "../Dropdown";
import { deleteWorkTask, moveWorkTask } from "./actions";
import { HoverDelete } from "../HoverDelete";
import { Avatar } from "../TaskCard";
import { WorkTaskDialog, type Project } from "./WorkTaskDialog";
import { TaskTagChip } from "../TaskTagPicker";
import type { TaskTagOption } from "../TaskTagPicker";
import type { WorkTaskLink, WorkTaskAttachment } from "./actions";
import { dueState } from "@/lib/due";

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
  const [saving, setSaving] = useState(false);

  async function complete() {
    setSaving(true);
    setError(null);
    const res = await moveWorkTask(task.id, "done", task.sortOrder);
    setSaving(false);
    if (res.error) setError(res.error);
    else router.refresh();
  }

  // judged in India's day, not UTC's — the old string compare against
  // toISOString() turned a task red at midnight UTC, 5:30am here
  const due = task.status === "done" ? null : dueState(task.dueDate, null);
  const dueTone = due === "overdue" ? "text-red-300" : due === "today" ? "text-amber-300" : "";
  // the same people the task's own dialog lets delete it: whoever it's for or
  // from, and the operations side (canManageTags is that same bar)
  const canDelete = task.assignedTo.id === actingUserId || task.createdBy.id === actingUserId || canManageTags;

  return (
    <>
      {/* The same card as the editing queue's (TaskCard), top to bottom:
          who it's for, what it is, its kind of work, who has it and when,
          then its stage. A div, not a button: the stage menu inside it is
          a button of its own. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => dialogRef.current?.open()}
        onKeyDown={(e) => e.key === "Enter" && dialogRef.current?.open()}
        className="card-surface card-interactive group relative flex w-full cursor-pointer flex-col gap-2 rounded-xl p-3 text-left shadow-sm"
      >
        {canDelete && (
          <HoverDelete
            title={task.title}
            onDelete={async () => {
              const res = await deleteWorkTask(task.id);
              if (res.error) setError(res.error);
              else router.refresh();
            }}
          />
        )}
        {/* room on the right for the corner delete */}
        <p className="min-w-0 truncate pr-7 text-xs text-muted">
          {task.project ? `${task.project.client.name} · ${task.project.name}` : "Own work"}
        </p>
        <p className="font-medium leading-snug">{task.title}</p>

        {(task.tags.length > 0 || task.category) && (
          <div className="flex flex-wrap items-center gap-1">
            {task.tags.map((t) => (
              <TaskTagChip key={t.id} name={t.name} />
            ))}
            {/* rows created before tags existed still carry a free-text
                category, shown so nothing silently disappears */}
            {task.tags.length === 0 && task.category && <TaskTagChip name={task.category} />}
          </div>
        )}

        {(showAssignee || task.dueDate || task.links.length + task.attachments.length > 0) && (
          <div className="flex min-w-0 items-center gap-2 text-xs text-muted">
            {showAssignee && (
              <>
                <Avatar name={task.assignedTo.name} />
                <span className="truncate">{task.assignedTo.name}</span>
              </>
            )}
            <span className="ml-auto flex shrink-0 items-center gap-3">
              {task.links.length + task.attachments.length > 0 && (
                <span className="flex items-center gap-1">
                  {task.links.length > 0 ? <Link2 size={12} /> : <Paperclip size={12} />} {task.links.length + task.attachments.length}
                </span>
              )}
              {task.dueDate && (
                <span className={`flex items-center gap-1 ${dueTone}`}>
                  <CalendarClock size={12} /> {shortDate(task.dueDate)}
                </span>
              )}
            </span>
          </div>
        )}

        {error && <p className="text-xs text-red-300">{error}</p>}

        {/* only once it's through review: finishing moves it off the board
            into History, the way the editing board only offers "Mark
            delivered" at the last stage */}
        {task.status === "in_review" && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              complete();
            }}
            disabled={saving}
            className="btn btn-sm status-pop flex w-full items-center justify-center gap-1.5 border border-emerald-400/30 bg-emerald-400/15 text-emerald-300 disabled:opacity-60"
          >
            <CheckCircle2 size={13} className="shrink-0" /> {saving ? "Completing…" : "Mark complete"}
          </button>
        )}
        {/* the stage, at the foot like the editing card's; on a board already
            in stage columns the column says it, so it's shown only when the
            board is laid out by person or team */}
        {showStatus && (
          <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            {/* keyed on status so it shows the saved stage after a refresh */}
            <Dropdown
              key={task.status}
              size="sm"
              defaultValue={task.status}
              options={ACTIVE_WORK_STATUSES.map((st) => ({ value: st, label: WORK_TASK_STAGE[st].label }))}
              onChange={async (v) => {
                setError(null);
                const res = await moveWorkTask(task.id, v as WorkTaskStatus, task.sortOrder);
                if (res.error) setError(res.error);
                else router.refresh();
              }}
            />
          </span>
        )}
      </div>

      <WorkTaskDialog ref={dialogRef} mode="edit" task={task} projects={projects} actingUserId={actingUserId} assignees={assignees} taskTags={taskTags} canManageTags={canManageTags} />
    </>
  );
}
