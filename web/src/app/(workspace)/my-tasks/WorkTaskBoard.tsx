"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { WorkTaskStatus } from "@prisma/client";
import { moveWorkTask, reorderWorkTask } from "./actions";
import { WorkTaskCard, type WorkTaskCardData } from "./WorkTaskCard";
import { WorkTaskDialog, type Project } from "./WorkTaskDialog";
import { StickyColumns, scrollPageNearEdge } from "../StickyColumns";
import { ListRow } from "./WorkTaskList";
import type { TaskTagOption } from "../TaskTagPicker";
import type { GroupBy } from "@/lib/workTaskStages";
import { GroupHeader, QueueCard, type Group, type QueueEnv } from "./grouping";


// A much lighter version of the client Task board's drag-and-drop: no
// workflow graph to check a drop against (see WorkTaskStatus in
// schema.prisma — any of the four columns is a valid move from any other),
// so this skips straight to "where did it land."
export function WorkTaskBoard({
  tasks,
  groups,
  groupBy,
  queueEnv,
  projects,
  actingUserId,
  showAssignee,
  assignees = [],
  taskTags = [],
  canManageTags = false,
  canCreate,
  layout = "board",
}: {
  tasks: WorkTaskCardData[];
  // the same tasks (plus editing-queue ones) already sorted into columns
  groups: Group[];
  groupBy: GroupBy;
  queueEnv?: QueueEnv;
  projects: Project[];
  actingUserId: string;
  showAssignee: boolean;
  assignees?: { id: string; name: string }[];
  taskTags?: TaskTagOption[];
  canManageTags?: boolean;
  canCreate: boolean;
  // by status only: the same cards and drag-and-drop, as a list of rows
  layout?: "board" | "list";
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

  // One stage's drop target, as cards or rows
  function dropZone(group: Group) {
    const status = group.status!;
    const columnTasks = columnOf(status);
    const list = layout === "list";
    return (
      <div
        className={
          !list
            ? "flex min-h-24 min-w-0 flex-1 flex-col gap-3"
            : columnTasks.length + group.queue.length === 0
              ? `rounded-xl transition-colors duration-150 ${draggingId ? "bg-foreground/[0.06]" : "bg-foreground/[0.02]"}`
              : "flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface/40"
        }
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
            className={`${list ? "cursor-grab active:cursor-grabbing" : ""} ${draggingId === task.id ? "opacity-40" : ""}`}
          >
            {list ? (
              <ListRow
                task={task}
                projects={projects}
                actingUserId={actingUserId}
                showAssignee={showAssignee}
                assignees={assignees}
                taskTags={taskTags}
                canManageTags={canManageTags}
                onChangeStatus={(s) => commitMove(s, task.id, task.sortOrder)}
              />
            ) : (
              <WorkTaskCard task={task} projects={projects} showAssignee={showAssignee} actingUserId={actingUserId} assignees={assignees} taskTags={taskTags} canManageTags={canManageTags} />
            )}
          </div>
        ))}
        {queueEnv && group.queue.map((task) => <QueueCard key={task.id} task={task} env={queueEnv} />)}
        {list ? (
          columnTasks.length + group.queue.length === 0 && (
            <p className="px-4 py-3 text-xs text-muted">{draggingId ? "Drop here" : "Nothing here"}</p>
          )
        ) : (
          <div className="h-6 shrink-0" />
        )}
      </div>
    );
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

      {/* By person or team: one column per group. Nothing to drag between —
          moving a card to another person isn't a status change — so status
          is shown on each card and changed from the task itself. Headers
          stay pinned as the page scrolls (see StickyColumns). */}
      {groupBy !== "status" &&
        (groups.length === 0 ? (
          <p className="text-sm text-muted">Nothing here yet.</p>
        ) : (
          <StickyColumns
            minColumn={11}
            columns={groups.map((group) => ({
              key: group.key,
              header: <GroupHeader group={group} count={group.work.length + group.queue.length} />,
              body: (
                <section className="flex min-w-0 flex-1 flex-col gap-3">
                  {group.work.map((task) => (
                    <WorkTaskCard key={task.id} task={task} projects={projects} showAssignee={groupBy !== "person"} showStatus actingUserId={actingUserId} assignees={assignees} taskTags={taskTags} canManageTags={canManageTags} />
                  ))}
                  {queueEnv && group.queue.map((task) => <QueueCard key={task.id} task={task} env={queueEnv} />)}
                </section>
              ),
            }))}
          />
        ))}

      {groupBy === "status" && layout === "board" && (
        <StickyColumns
          minColumn={11}
          stretch
          columns={groups.map((group) => ({
            key: group.key,
            header: <GroupHeader group={group} count={columnOf(group.status!).length + group.queue.length} />,
            body: (
              <section className="flex min-w-0 flex-1 flex-col gap-3">
                {group.status === "todo" && canCreate && (
                  <WorkTaskDialog mode="create" projects={projects} actingUserId={actingUserId} assignees={assignees} taskTags={taskTags} canManageTags={canManageTags} />
                )}
                {dropZone(group)}
              </section>
            ),
          }))}
        />
      )}

      {/* the list: every stage in turn, header pinned, rows draggable
          between stages just like the cards */}
      {groupBy === "status" && layout === "list" && (
        <div className="flex flex-col gap-6" onDragOver={scrollPageNearEdge}>
          {groups.map((group) => (
            <section key={group.key} className="flex flex-col gap-2">
              <div className="sticky top-[calc(-1*var(--page-pad,0px))] z-10 bg-background py-2">
                <GroupHeader group={group} count={columnOf(group.status!).length + group.queue.length} className="w-fit" />
              </div>
              {dropZone(group)}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
