"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { WorkTaskStatus } from "@prisma/client";
import { WORK_TASK_STAGE, WORK_TASK_STATUSES } from "@/lib/workTaskStages";
import { moveWorkTask, reorderWorkTask } from "./actions";
import { WorkTaskCard, type WorkTaskCardData } from "./WorkTaskCard";
import { WorkTaskDialog } from "./WorkTaskDialog";
import type { TaskTagOption } from "../TaskTagPicker";

type Project = { id: string; name: string; client: { name: string } };

// A much lighter version of the client Task board's drag-and-drop: no
// workflow graph to check a drop against (see WorkTaskStatus in
// schema.prisma — any of the four columns is a valid move from any other),
// so this skips straight to "where did it land."
export function WorkTaskBoard({
  tasks,
  projects,
  actingUserId,
  showAssignee,
  assignees = [],
  taskTags = [],
  canManageTags = false,
  canCreate,
}: {
  tasks: WorkTaskCardData[];
  projects: Project[];
  actingUserId: string;
  showAssignee: boolean;
  assignees?: { id: string; name: string }[];
  taskTags?: TaskTagOption[];
  canManageTags?: boolean;
  canCreate: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [optimisticTasks, applyOptimistic] = useOptimistic(
    tasks,
    (state, update: { taskId: string; sortOrder: number; status?: WorkTaskStatus }) =>
      state.map((t) =>
        t.id === update.taskId ? { ...t, sortOrder: update.sortOrder, ...(update.status ? { status: update.status } : {}) } : t
      )
  );

  function commitMove(to: WorkTaskStatus, taskId: string, sortOrder: number) {
    startTransition(async () => {
      applyOptimistic({ taskId, sortOrder, status: to });
      const res = await moveWorkTask(taskId, to, sortOrder);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  function commitReorder(taskId: string, sortOrder: number) {
    startTransition(async () => {
      applyOptimistic({ taskId, sortOrder });
      const res = await reorderWorkTask(taskId, sortOrder);
      if (res.error) setError(res.error);
    });
  }

  function columnOf(status: WorkTaskStatus) {
    return optimisticTasks.filter((t) => t.status === status).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  // same cursor-vs-midpoint approach as the client Task board (see
  // Board.tsx's dropSortOrder for the full reasoning) — works from
  // wherever in the column the drop lands, not just near one card's edge
  function dropSortOrder(columnTasks: WorkTaskCardData[], excludeId: string, container: HTMLElement, clientY: number): number {
    const remaining = columnTasks.filter((t) => t.id !== excludeId);
    const cardEls = Array.from(container.querySelectorAll<HTMLElement>("[data-work-task-id]"));
    let insertIdx = remaining.length;
    for (const el of cardEls) {
      const id = el.dataset.workTaskId;
      if (!id || id === excludeId) continue;
      const idx = remaining.findIndex((t) => t.id === id);
      if (idx === -1) continue;
      const rect = el.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        insertIdx = idx;
        break;
      }
    }
    const before = remaining[insertIdx];
    const after = remaining[insertIdx - 1];
    if (before && after) return (before.sortOrder + after.sortOrder) / 2;
    if (before) return before.sortOrder - 1;
    if (after) return after.sortOrder + 1;
    return 0;
  }

  function handleColumnDrop(to: WorkTaskStatus, e: React.DragEvent<HTMLDivElement>) {
    const taskId = draggingId;
    setDraggingId(null);
    if (!taskId) return;
    const draggedTask = optimisticTasks.find((t) => t.id === taskId);
    if (!draggedTask) return;
    const sortOrder = dropSortOrder(columnOf(to), taskId, e.currentTarget, e.clientY);
    if (draggedTask.status === to) commitReorder(taskId, sortOrder);
    else commitMove(to, taskId, sortOrder);
  }

  return (
    <div>
      {error && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-300">
          {error}
          <button onClick={() => setError(null)} className="shrink-0 hover:text-red-100">
            Dismiss
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {WORK_TASK_STATUSES.map((status) => {
          const stage = WORK_TASK_STAGE[status];
          const columnTasks = columnOf(status);
          return (
            <section key={status} className="flex min-w-0 flex-col gap-3">
              <div
                className={`status-pop flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium ${stage.pill}`}
              >
                <span className={`h-2 w-2 rounded-full ${stage.dot}`} />
                <span className="whitespace-nowrap">{stage.label}</span>
                <span className="ml-auto rounded-full bg-black/20 px-2 text-xs">{columnTasks.length}</span>
              </div>

              {status === "todo" && canCreate && (
                <WorkTaskDialog mode="create" projects={projects} actingUserId={actingUserId} assignees={assignees} taskTags={taskTags} canManageTags={canManageTags} />
              )}

              <div
                className="flex min-h-24 min-w-0 flex-1 flex-col gap-3"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleColumnDrop(status, e);
                }}
              >
                {columnTasks.map((task) => (
                  <div
                    key={task.id}
                    data-work-task-id={task.id}
                    draggable
                    onDragStart={() => setDraggingId(task.id)}
                    onDragEnd={() => setDraggingId(null)}
                    className={draggingId === task.id ? "opacity-40" : undefined}
                  >
                    <WorkTaskCard task={task} projects={projects} showAssignee={showAssignee} actingUserId={actingUserId} assignees={assignees} taskTags={taskTags} canManageTags={canManageTags} />
                  </div>
                ))}
                <div className="h-6 shrink-0" />
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
