"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TaskCard, STATUS_STYLE, EXTRA_FIELD, type TaskCardData } from "./TaskCard";
import { NewTaskRow } from "./NewTaskRow";
import { moveTask, reorderTask } from "./actions";
import type { Role, TaskStatus } from "@/lib/workflow";

export type Column = { status: TaskStatus; label: string; dot: string };

export const ALL_COLUMNS: Column[] = [
  { status: "queued", label: "Queued", dot: "bg-neutral-400" },
  { status: "editing", label: "Editing", dot: "bg-blue-400" },
  { status: "sent_for_approval", label: "Sent for approval", dot: "bg-purple-400" },
  { status: "revision_requested", label: "Revision requested", dot: "bg-orange-400" },
  { status: "final_export_ready", label: "Final export ready", dot: "bg-green-400" },
  { status: "delivered_and_uploaded", label: "Delivered and uploaded", dot: "bg-emerald-400" },
];

// the live board for everyone — admin, core, and editors alike. Editors just
// can't act past "Final export ready" (only ops moves it to Delivered), and
// only see their own tasks (enforced in page.tsx, not here). Once a task is
// actually delivered it's done, so it drops off the board into History.
export const BOARD_COLUMNS: Column[] = ALL_COLUMNS.filter((c) => c.status !== "delivered_and_uploaded");

type Project = { id: string; client: { name: string } };
type Editor = { id: string; name: string };

// hides raw Prisma/connection-string errors (expected on the demo page,
// which has no real database) behind one clear sentence
function friendlyError(err: unknown): string {
  const message = err instanceof Error ? err.message : "";
  if (/database|connection string|prisma/i.test(message)) {
    return "Not connected to a real database yet — this demo page can't save changes until Supabase is set up.";
  }
  return message || "Couldn't move that task.";
}

export function Board({
  tasks,
  projects,
  editors,
  actingUserId,
  actingRole,
  canCreate = true,
  columns = BOARD_COLUMNS,
}: {
  tasks: TaskCardData[];
  projects: Project[];
  editors: Editor[];
  actingUserId: string;
  actingRole: Role;
  canCreate?: boolean;
  columns?: Column[];
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [pending, setPending] = useState<{ taskId: string; to: TaskStatus; sortOrder: number } | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function commitMove(to: TaskStatus, taskId: string, sortOrder: number, extra: Record<string, string> = {}) {
    try {
      await moveTask(taskId, to, actingUserId, actingRole, { ...extra, sortOrder });
      router.refresh();
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  async function commitReorder(taskId: string, sortOrder: number) {
    try {
      await reorderTask(taskId, sortOrder);
      router.refresh();
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  function columnOf(status: TaskStatus) {
    return tasks.filter((t) => t.status === status).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  // dropped on empty column space (not on a specific card) — send it to
  // the end of that column
  function handleDrop(to: TaskStatus) {
    const taskId = draggingId;
    setDraggingId(null);
    if (!taskId) return;

    const columnTasks = columnOf(to).filter((t) => t.id !== taskId);
    const sortOrder = (columnTasks.at(-1)?.sortOrder ?? 0) + 1;

    const draggedTask = tasks.find((t) => t.id === taskId);
    if (draggedTask?.status === to) {
      commitReorder(taskId, sortOrder);
      return;
    }
    const extra = EXTRA_FIELD[to];
    if (extra) {
      setPending({ taskId, to, sortOrder });
      setInputValue("");
      dialogRef.current?.showModal();
      return;
    }
    commitMove(to, taskId, sortOrder);
  }

  // dropped directly on another card — insert right before it (same
  // column: pure reorder; different column: reorder + status change)
  function handleDropOnCard(to: TaskStatus, targetTask: TaskCardData) {
    const taskId = draggingId;
    setDraggingId(null);
    if (!taskId || taskId === targetTask.id) return;

    const columnTasks = columnOf(to).filter((t) => t.id !== taskId);
    const idx = columnTasks.findIndex((t) => t.id === targetTask.id);
    const prevTask = columnTasks[idx - 1];
    const sortOrder = prevTask ? (prevTask.sortOrder + targetTask.sortOrder) / 2 : targetTask.sortOrder - 1;

    const draggedTask = tasks.find((t) => t.id === taskId);
    if (draggedTask?.status === to) {
      commitReorder(taskId, sortOrder);
      return;
    }
    const extra = EXTRA_FIELD[to];
    if (extra) {
      setPending({ taskId, to, sortOrder });
      setInputValue("");
      dialogRef.current?.showModal();
      return;
    }
    commitMove(to, taskId, sortOrder);
  }

  function confirmDialog() {
    if (!pending) return;
    const extra = EXTRA_FIELD[pending.to];
    if (!extra || !inputValue.trim()) return;
    commitMove(pending.to, pending.taskId, pending.sortOrder, { [extra.field]: inputValue.trim() });
    dialogRef.current?.close();
    setPending(null);
  }

  const extraField = pending ? EXTRA_FIELD[pending.to] : undefined;

  return (
    <div>
      {error && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-300">
          {error}
          <button onClick={() => setError(null)} className="ml-3 text-red-300/70 hover:text-red-200">
            Dismiss
          </button>
        </div>
      )}

      <dialog
        ref={dialogRef}
        onClose={() => setPending(null)}
        // Tailwind's reset zeroes out margin, which is what the browser
        // normally uses to center a <dialog> — so we center it explicitly.
        className="glass fixed top-1/2 left-1/2 m-0 -translate-x-1/2 -translate-y-1/2 rounded-xl p-4 text-foreground"
      >
        {extraField && (
          <form
            method="dialog"
            className="flex w-72 flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              confirmDialog();
            }}
          >
            <p className="text-sm font-medium">{extraField.label}</p>
            <input
              autoFocus
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={extraField.placeholder}
              className="rounded-md border border-border bg-surface-2 px-2 py-1 text-sm"
            />
            <div className="mt-1 flex justify-end gap-2">
              <button type="button" onClick={() => dialogRef.current?.close()} className="rounded-md px-3 py-1 text-sm text-muted hover:bg-hover">
                Cancel
              </button>
              <button type="submit" className="btn-glow rounded-md px-3 py-2 text-sm font-medium">
                Confirm
              </button>
            </div>
          </form>
        )}
      </dialog>

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        {columns.map((col) => {
          const columnTasks = columnOf(col.status);
          return (
            <section
              key={col.status}
              className="flex min-w-0 flex-col gap-3"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(col.status)}
            >
              <div className={`status-pop flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium ${STATUS_STYLE[col.status]}`}>
                <span className={`h-2 w-2 rounded-full ${col.dot}`} />
                {col.label}
                <span className="ml-auto rounded-full bg-black/20 px-2 text-xs">{columnTasks.length}</span>
              </div>

              {col.status === "queued" && canCreate && <NewTaskRow projects={projects} editors={editors} />}

              <div className="flex flex-col gap-3">
                {columnTasks.map((task) => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={() => setDraggingId(task.id)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDropOnCard(col.status, task);
                    }}
                    className={draggingId === task.id ? "opacity-40" : undefined}
                  >
                    <TaskCard
                      task={task}
                      clientName={task.project.client.name}
                      editors={editors}
                      projects={projects}
                      actingUserId={actingUserId}
                      actingRole={actingRole}
                    />
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
