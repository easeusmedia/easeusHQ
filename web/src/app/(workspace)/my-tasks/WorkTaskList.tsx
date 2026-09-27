"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, Link2, Paperclip, Trash2 } from "lucide-react";
import type { WorkTaskStatus } from "@prisma/client";
import { ACTIVE_WORK_STATUSES, WORK_TASK_STAGE } from "@/lib/workTaskStages";
import { AssigneeLabel } from "../TaskCard";
import { Dropdown } from "../Dropdown";
import { deleteWorkTask, moveWorkTask } from "./actions";
import { ConfirmButton } from "../ConfirmButton";
import { WorkTaskDialog, type Project } from "./WorkTaskDialog";
import { TaskTagChip } from "../TaskTagPicker";
import type { WorkTaskCardData } from "./WorkTaskCard";
import type { TaskTagOption } from "../TaskTagPicker";
import type { GroupBy } from "@/lib/workTaskStages";
import { GroupTitle, QueueRow, type Group, type QueueEnv } from "./grouping";
import { dueState } from "@/lib/due";


function shortDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const STATUS_OPTIONS = ACTIVE_WORK_STATUSES.map((s) => ({ value: s, label: WORK_TASK_STAGE[s].label }));

// The board arranged staggered on purpose (see WorkTaskBoard) — this is
// the same tasks, same data, laid out as one plain grouped list instead,
// for anyone who'd rather scan a column of rows than a wall of cards.
// Status changes here via a plain dropdown per row, not drag-and-drop.
export function WorkTaskList({
  groups,
  groupBy,
  queueEnv,
  projects,
  actingUserId,
  showAssignee,
  assignees = [],
  taskTags = [],
  canManageTags = false,
}: {
  groups: Group[];
  groupBy: GroupBy;
  queueEnv?: QueueEnv;
  projects: Project[];
  actingUserId: string;
  showAssignee: boolean;
  assignees?: { id: string; name: string }[];
  taskTags?: TaskTagOption[];
  canManageTags?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  // sortOrder carries over unchanged — a plain status change here, not a
  // reorder, and Date.now() (what the board's own drag-and-drop uses for
  // a freshly-placed card) is an impure call React's own rules disallow
  // calling from a component body even indirectly like this
  async function changeStatus(taskId: string, sortOrder: number, status: WorkTaskStatus) {
    const res = await moveWorkTask(taskId, status, sortOrder);
    if (res.error) setError(res.error);
    else router.refresh();
  }

  return (
    <div className="flex flex-col gap-7">
      {error && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-300">
          {error}
          <button onClick={() => setError(null)} className="shrink-0 hover:text-red-100">
            Dismiss
          </button>
        </div>
      )}

      {groups.map((group) => {
        const rows = group.work;
        const count = rows.length + group.queue.length;
        if (count === 0) return null;
        // grouped by person, every row is theirs — no need to repeat the name
        const rowAssignee = showAssignee && groupBy !== "person";
        return (
          <section key={group.key} className="flex flex-col gap-1.5">
            {/* pinned while its own rows scroll past */}
            <div className="sticky top-[calc(-1*var(--page-pad,0px))] z-10 bg-background py-2">
              <GroupTitle group={group} count={count} />
            </div>

            {rows.length > 0 && (
            <div className="flex flex-col divide-y divide-white/[0.05] overflow-hidden panel-soft rounded-2xl">
              {rows.map((task) => (
                <ListRow
                  key={task.id}
                  task={task}
                  projects={projects}
                  actingUserId={actingUserId}
                  showAssignee={rowAssignee}
                  assignees={assignees}
                  taskTags={taskTags} canManageTags={canManageTags}
                  onChangeStatus={(s) => changeStatus(task.id, task.sortOrder, s)}
                />
              ))}
            </div>
            )}
            {/* editing-queue tasks as their own rows — the same ones a
                client's page and the Editors list use */}
            {queueEnv && group.queue.length > 0 && (
              <ul className="flex flex-col gap-2">
                {group.queue.map((task) => (
                  <li key={task.id}>
                    <QueueRow task={task} env={queueEnv} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {groups.every((g) => g.work.length + g.queue.length === 0) && <p className="text-sm text-muted">Nothing here yet.</p>}
    </div>
  );
}

// One task as a to-do row: a circle in its stage's colour (the tick that
// finishes it, once it's in review), the title with what it's for and when
// underneath, then who has it and its stage. Deleting shows on hover.
export function ListRow({
  task,
  projects,
  actingUserId,
  showAssignee,
  assignees,
  taskTags,
  canManageTags,
  onChangeStatus,
}: {
  task: WorkTaskCardData;
  projects: Project[];
  actingUserId: string;
  showAssignee: boolean;
  assignees: { id: string; name: string }[];
  taskTags: TaskTagOption[];
  canManageTags: boolean;
  onChangeStatus: (status: WorkTaskStatus) => void;
}) {
  const router = useRouter();
  const dialogRef = useRef<{ open: () => void }>(null);
  // judged in India's day, not UTC's — the old string compare against
  // toISOString() turned a task red at midnight UTC, 5:30am here
  const due = task.status === "done" ? null : dueState(task.dueDate, null);
  const dueTone = due === "overdue" ? "text-red-300" : due === "today" ? "text-amber-300" : "";
  const stage = WORK_TASK_STAGE[task.status];
  // the same people the task's own dialog lets delete it (see WorkTaskCard)
  const canDelete = task.assignedTo.id === actingUserId || task.createdBy.id === actingUserId || canManageTags;
  const hasMeta = !!task.project || !!task.dueDate || task.tags.length > 0 || !!task.category || task.links.length + task.attachments.length > 0;

  return (
    <>
      {/* a div, not a button — it holds buttons of its own, and a button
          can't legally contain another; each stops its click from also
          opening the task */}
      <div
        onClick={() => dialogRef.current?.open()}
        className="group flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-white/[0.03]"
      >
        {task.status === "in_review" ? (
          // the same finish as on a card, and only at the same point
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChangeStatus("done");
            }}
            title="Mark as complete. It moves to History."
            aria-label="Mark as complete"
            className="group/done flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-purple-400/70 text-emerald-300 transition-colors hover:border-emerald-400 hover:bg-emerald-400/15"
          >
            <Check size={11} className="opacity-0 transition-opacity group-hover/done:opacity-100" />
          </button>
        ) : (
          <span className={`size-[18px] shrink-0 rounded-full border-[1.5px] ${task.status === "in_progress" ? "border-blue-400/70" : "border-white/25"}`} />
        )}

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{task.title}</span>
          {hasMeta && (
            <span className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted">
              {task.tags.map((t) => (
                <TaskTagChip key={t.id} name={t.name} />
              ))}
              {task.tags.length === 0 && task.category && <TaskTagChip name={task.category} />}
              {task.project && (
                <span className="truncate">
                  {task.project.client.name} · {task.project.name}
                </span>
              )}
              {task.dueDate && (
                <span className={`flex shrink-0 items-center gap-1 ${dueTone}`}>
                  <CalendarClock size={12} /> {shortDate(task.dueDate)}
                </span>
              )}
              {task.links.length + task.attachments.length > 0 && (
                <span className="flex shrink-0 items-center gap-1">
                  {task.links.length > 0 ? <Link2 size={12} /> : <Paperclip size={12} />} {task.links.length + task.attachments.length}
                </span>
              )}
            </span>
          )}
        </span>

        {showAssignee && <AssigneeLabel name={task.assignedTo.name} />}
        {/* key={task.status}: Dropdown takes defaultValue at mount only, so
            it remounts to show the saved stage after a refresh */}
        <span onClick={(e) => e.stopPropagation()} className="shrink-0">
          <Dropdown
            key={task.status}
            size="sm"
            pill={{ icon: <span className={`size-1.5 rounded-full ${stage.dot}`} /> }}
            defaultValue={task.status}
            options={STATUS_OPTIONS}
            onChange={(v) => onChangeStatus(v as WorkTaskStatus)}
          />
        </span>
        {canDelete && (
          <span
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
          >
            <ConfirmButton
              message={`Delete "${task.title}"? This can't be undone.`}
              onConfirm={async () => {
                const res = await deleteWorkTask(task.id);
                if (!res.error) router.refresh();
              }}
              className="flex size-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-white/[0.06] hover:text-red-300"
            >
              <Trash2 size={14} aria-label="Delete task" />
            </ConfirmButton>
          </span>
        )}
      </div>

      <WorkTaskDialog ref={dialogRef} mode="edit" task={task} projects={projects} actingUserId={actingUserId} assignees={assignees} taskTags={taskTags} canManageTags={canManageTags} />
    </>
  );
}
