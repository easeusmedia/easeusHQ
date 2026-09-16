"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Link2, Paperclip } from "lucide-react";
import type { WorkTaskStatus } from "@prisma/client";
import { WORK_TASK_STAGE, WORK_TASK_STATUSES } from "@/lib/workTaskStages";
import { AssigneeLabel } from "../TaskCard";
import { Dropdown } from "../Dropdown";
import { moveWorkTask } from "./actions";
import { WorkTaskDialog } from "./WorkTaskDialog";
import { TaskTagChip } from "../TaskTagPicker";
import type { WorkTaskCardData } from "./WorkTaskCard";
import type { TaskTagOption } from "../TaskTagPicker";
import type { GroupBy } from "@/lib/workTaskStages";
import { GroupHeader, QueueRow, type Group } from "./grouping";

type Project = { id: string; name: string; client: { name: string } };

function shortDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const STATUS_OPTIONS = WORK_TASK_STATUSES.map((s) => ({ value: s, label: WORK_TASK_STAGE[s].label }));

// The board arranged staggered on purpose (see WorkTaskBoard) — this is
// the same tasks, same data, laid out as one plain grouped list instead,
// for anyone who'd rather scan a column of rows than a wall of cards.
// Status changes here via a plain dropdown per row, not drag-and-drop.
export function WorkTaskList({
  groups,
  groupBy,
  projects,
  actingUserId,
  showAssignee,
  assignees = [],
  taskTags = [],
  canManageTags = false,
}: {
  groups: Group[];
  groupBy: GroupBy;
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
    <div className="flex flex-col gap-6">
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
          <section key={group.key} className="flex flex-col gap-2">
            <GroupHeader group={group} count={count} className="w-fit" />

            <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface/40">
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
              {group.queue.map((task) => (
                <QueueRow key={task.id} task={task} showAssignee={rowAssignee} />
              ))}
            </div>
          </section>
        );
      })}

      {groups.every((g) => g.work.length + g.queue.length === 0) && <p className="text-sm text-muted">Nothing here yet.</p>}
    </div>
  );
}

function ListRow({
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
  const dialogRef = useRef<{ open: () => void }>(null);
  const overdue = !!task.dueDate && task.status !== "done" && task.dueDate < new Date().toISOString().slice(0, 10);

  return (
    <>
      {/* a div, not a button — it contains the Dropdown below, which is
          its own real <button>, and a button can't legally contain
          another one (same reason TaskCard's own row is a div, not a
          button: nested interactive controls, each stopping its own
          click from bubbling up to this row's) */}
      <div
        onClick={() => dialogRef.current?.open()}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left hover:bg-surface-2"
      >
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{task.title}</span>
        {(task.tags.length > 0 || task.category) && (
          <span className="hidden shrink-0 items-center gap-1 sm:flex">
            {task.tags.map((t) => (
              <TaskTagChip key={t.id} name={t.name} />
            ))}
            {task.tags.length === 0 && task.category && <TaskTagChip name={task.category} />}
          </span>
        )}
        {task.project && (
          <span className="hidden shrink-0 truncate text-xs text-muted sm:inline">
            {task.project.client.name} · {task.project.name}
          </span>
        )}
        <span className="flex shrink-0 items-center gap-3 text-xs text-muted">
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
        </span>
        {showAssignee && <AssigneeLabel name={task.assignedTo.name} />}
        {/* key={task.status}: Dropdown tracks its own selection internally
            from defaultValue at mount only — without a remount keyed to
            the actual status, it'd keep showing whatever was selected
            right up until the row itself unmounts, even after the change
            it reported actually saved and the page refreshed with it */}
        <span onClick={(e) => e.stopPropagation()} className="w-36 shrink-0">
          <Dropdown
            key={task.status}
            size="sm"
            defaultValue={task.status}
            options={STATUS_OPTIONS}
            onChange={(v) => onChangeStatus(v as WorkTaskStatus)}
          />
        </span>
      </div>

      <WorkTaskDialog ref={dialogRef} mode="edit" task={task} projects={projects} actingUserId={actingUserId} assignees={assignees} taskTags={taskTags} canManageTags={canManageTags} />
    </>
  );
}
