"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { TaskCard, STATUS_STYLE, EXTRA_FIELD, type TaskCardData } from "./TaskCard";
import { NewTaskRow } from "./NewTaskRow";
import { moveTask, reorderTask } from "./actions";
import { STAGE } from "@/lib/stages";
import { ALL_STATUSES, canTransition, type Role, type TaskStatus } from "@/lib/workflow";

export type Column = { status: TaskStatus; label: string; dot: string };

export const ALL_COLUMNS: Column[] = ALL_STATUSES.map((status) => ({
  status,
  label: STAGE[status].label,
  dot: STAGE[status].dot,
}));

// the live board for everyone — admin, core, and editors alike. Editors just
// can't act past "Final export ready" (only ops moves it to Delivered), and
// only see their own tasks (enforced in page.tsx, not here). Once a task is
// actually delivered it's done, so it drops off the board into History.
export const BOARD_COLUMNS: Column[] = ALL_COLUMNS.filter((c) => c.status !== "delivered_and_uploaded");

type Project = { id: string; client: { name: string } };
type Editor = { id: string; name: string };

// the task already has a Frame.io/Drive link on file from an earlier pass
// (e.g. it was sent for approval once, sent back for revision, and is now
// being resubmitted) — prefill instead of making them retype the same link
// every time it crosses this same status again.
function existingLinkValue(task: TaskCardData | undefined, field: "frameioLink" | "driveLink" | "reviewNotes"): string {
  if (!task || field === "reviewNotes") return "";
  return task[field] ?? "";
}

// hides raw Prisma/connection-string errors (expected on the demo page,
// which has no real database) behind one clear sentence

function friendlyError(message: string): string {
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
  const [, startTransition] = useTransition();

  // the card moves the instant you drop it — the server round-trip (and
  // router.refresh() reconciling with the real DB state once it lands)
  // happens in the background instead of blocking the visual move
  const [optimisticTasks, applyOptimistic] = useOptimistic(
    tasks,
    (state, update: { taskId: string; sortOrder: number; status?: TaskStatus }) =>
      state.map((t) =>
        t.id === update.taskId ? { ...t, sortOrder: update.sortOrder, ...(update.status ? { status: update.status } : {}) } : t
      )
  );

  function commitMove(to: TaskStatus, taskId: string, sortOrder: number, extra: Record<string, string> = {}) {
    startTransition(async () => {
      applyOptimistic({ taskId, sortOrder, status: to });
      try {
        const result = await moveTask(taskId, to, actingUserId, actingRole, { ...extra, sortOrder });
        if (result?.error) {
          setError(friendlyError(result.error));
          return;
        }
        router.refresh();
      } catch (err) {
        setError(friendlyError(err instanceof Error ? err.message : ""));
      }
    });
  }

  function commitReorder(taskId: string, sortOrder: number) {
    startTransition(async () => {
      applyOptimistic({ taskId, sortOrder });
      try {
        // no router.refresh() here — a pure reorder doesn't change anything
        // any other Server Component reads, so the optimistic state is
        // already the final answer. Refreshing after every single drag was
        // firing a full RSC refetch per drop; chaining several reorders in
        // a row queued up overlapping refetches that raced the optimistic
        // state and landed as the exact "stuck/laggy" symptom reported.
        const result = await reorderTask(taskId, sortOrder);
        if (result?.error) setError(friendlyError(result.error));
      } catch (err) {
        setError(friendlyError(err instanceof Error ? err.message : ""));
      }
    });
  }

  function columnOf(status: TaskStatus) {
    return optimisticTasks.filter((t) => t.status === status).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  // same rule the status dropdown already filters its options by — dragging
  // shouldn't offer a move the workflow wouldn't let you pick from the menu
  function canDropInto(task: TaskCardData | undefined, to: TaskStatus): boolean {
    if (!task) return false;
    if (task.status === to) return true; // reordering within the same column, not a status change
    const isAssignee = task.assignedTo?.id === actingUserId;
    return canTransition(task.status, to, { role: actingRole, isAssignee });
  }

  // Figures out where in the column the drop should land by comparing the
  // cursor's Y position against every remaining card's own vertical
  // midpoint — cursor above a card's midpoint means "insert before it",
  // below means "keep looking" (falling through the loop means "insert at
  // the end"). This runs once per drop, over every card in the column, so
  // it doesn't depend on which specific nested element inside a card
  // happened to be the drop's event target, or on that one card's own
  // bounding box in isolation — both of which turned out fragile in
  // practice (per-card top/bottom-half hit-testing kept only working for
  // "drop near the top", never reliably for "drop at the bottom" once a
  // column had a few cards in it).
  function dropSortOrder(columnTasks: TaskCardData[], excludeId: string, container: HTMLElement, clientY: number): number {
    const remaining = columnTasks.filter((t) => t.id !== excludeId);
    const cardEls = Array.from(container.querySelectorAll<HTMLElement>("[data-task-id]"));
    let insertIdx = remaining.length;
    for (const el of cardEls) {
      const id = el.dataset.taskId;
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

  // one drop handler per column, attached to the whole card-list container
  // (not per card) — covers dropping on a card, between cards, or in the
  // empty space below the last one, all the same way
  function handleColumnDrop(to: TaskStatus, e: React.DragEvent<HTMLDivElement>) {
    const taskId = draggingId;
    setDraggingId(null);
    if (!taskId) return;
    const draggedTask = optimisticTasks.find((t) => t.id === taskId);
    if (!canDropInto(draggedTask, to)) {
      setError("Only the ops team can move a task to that stage.");
      return;
    }

    const sortOrder = dropSortOrder(columnOf(to), taskId, e.currentTarget, e.clientY);

    if (draggedTask?.status === to) {
      commitReorder(taskId, sortOrder);
      return;
    }
    const extra = EXTRA_FIELD[to];
    if (extra) {
      setPending({ taskId, to, sortOrder });
      setInputValue(existingLinkValue(draggedTask, extra.field));
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
    <div className="flex h-full flex-col">
      {error && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
          <div className="glass flex max-w-sm flex-col items-center gap-4 rounded-xl p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-400/15">
              <ShieldAlert size={22} className="text-red-300" />
            </div>
            <p className="text-sm text-foreground">{error}</p>
            <button onClick={() => setError(null)} className="btn-glow rounded-md px-4 py-2 text-sm font-medium">
              Dismiss
            </button>
          </div>
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
              <button type="button" onClick={() => dialogRef.current?.close()} className="rounded-md px-3 py-1 text-sm btn-ghost">
                Cancel
              </button>
              <button type="submit" className="btn-glow rounded-md px-3 py-2 text-sm font-medium">
                Confirm
              </button>
            </div>
          </form>
        )}
      </dialog>

      {/* flex row, not a wrapping grid — a wrapping grid was dropping later
          columns onto a second line the instant the sidebar (or window)
          took away enough width, instead of just letting columns shrink or
          scroll. items-start also stops flex's default row-stretch from
          forcing every column to the height of the tallest one — that was
          the actual drag-to-bottom bug: a column with several cards was
          often already the tallest, so it had zero spare space below its
          own last card for a drop to land in, while a shorter column had
          tons (borrowed from the tall one). Each column now sizes to its
          own content, and the sentinel spacer below gives a real drop
          target below the last card regardless. */}
      <div className="flex min-h-0 flex-1 items-start gap-4 overflow-auto">
        {columns.map((col) => {
          const columnTasks = columnOf(col.status);
          return (
            <section key={col.status} className="flex min-w-60 flex-1 flex-col gap-3">
              <div className={`status-pop flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium ${STATUS_STYLE[col.status]}`}>
                <span className={`h-2 w-2 rounded-full ${col.dot}`} />
                {col.label}
                <span className="ml-auto rounded-full bg-black/20 px-2 text-xs">{columnTasks.length}</span>
              </div>

              {col.status === "queued" && canCreate && <NewTaskRow projects={projects} editors={editors} />}

              {/* the whole drop target for this column, cards and all */}
              <div
                className="flex min-h-24 flex-1 flex-col gap-3"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleColumnDrop(col.status, e);
                }}
              >
                {columnTasks.map((task) => (
                  <div
                    key={task.id}
                    data-task-id={task.id}
                    draggable
                    onDragStart={() => setDraggingId(task.id)}
                    // safety net: if the drop lands somewhere that never
                    // calls handleColumnDrop (dropped outside any dropzone,
                    // drag cancelled with Escape, dropped on the browser
                    // chrome), draggingId was never getting cleared — the
                    // card stayed stuck at 40% opacity, unclickable, until
                    // the next drag. This always fires, drop or not.
                    onDragEnd={() => setDraggingId(null)}
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
                {/* guaranteed droppable cushion below the last card — not
                    just leftover flex space, which shrinks to nothing once
                    this column has enough cards of its own */}
                <div className="h-16 shrink-0" />
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
