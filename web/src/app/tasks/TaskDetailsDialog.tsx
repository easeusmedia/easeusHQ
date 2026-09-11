"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, useActionState } from "react";
import { ChevronDown, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { updateTask, deleteTask, getTaskActivity, type TaskFormState } from "./actions";
import { ConfirmButton } from "./ConfirmButton";
import { NotesGlyph, linkify } from "./NotesButton";
import { Dropdown } from "./Dropdown";
import { Avatar, formatDateTime } from "./TaskCard";
import type { Role } from "@/lib/workflow";
import type { TaskCardData } from "./TaskCard";

const initialState: TaskFormState = {};

type LogEntry = { createdAt: Date; action: string; actorName: string };

// Everything about one task, in one place: the full picture on the left
// (notes, links, who it's assigned to, created-by/when), and — collapsed by
// default, since most opens don't need it — the complete stage-by-stage
// trail on the right. Replaces the separate small "info" icon and the
// separate Edit dialog; both "click the card" and the "Edit" button open
// this same dialog. Admin/core can edit every field; an editor can only
// edit their own task's Frame.io link — everything else here is ops' input.
export const TaskDetailsDialog = forwardRef<{ open: () => void }, {
  task: TaskCardData;
  clientName: string;
  editors: { id: string; name: string }[];
  projects: { id: string; client: { name: string } }[];
  actingUserId: string;
  actingRole: Role;
}>(function TaskDetailsDialog({ task, clientName, editors, projects, actingUserId, actingRole }, ref) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState(updateTask, initialState);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[] | null>(null);
  const [editingFrameio, setEditingFrameio] = useState(false);

  const canManage = actingRole === "admin" || actingRole === "core";
  const isAssignee = task.assignedTo?.id === actingUserId;
  // only while it's actually under review — that's the one window an
  // editor has anything to fix on their own submission
  const canEditFrameio = !canManage && isAssignee && task.status === "sent_for_approval";

  function open() {
    dialogRef.current?.showModal();
    setEditingFrameio(false);
    // always refetch, not just once — the trail changes every time the
    // task's status changes elsewhere on the board, and this component
    // instance can stay mounted (and its state cached) across many of
    // those actions, even across days, without a full page reload. Only
    // fetching once meant a reopen could show a stale trail — someone
    // moving a task "now" would still see whatever the log looked like the
    // first time this dialog was ever opened.
    setLogs(null);
    getTaskActivity(task.id).then(setLogs);
  }

  useImperativeHandle(ref, () => ({ open }));

  // only close on an actual successful save — a validation error should
  // leave the dialog open so it's visible
  useEffect(() => {
    if (state.success) dialogRef.current?.close();
  }, [state]);

  const created = logs?.[0];
  const formId = `task-details-form-${task.id}`;

  return (
      <dialog
        ref={dialogRef}
        onClose={() => setHistoryOpen(false)}
        className={`dialog-grow glass fixed top-1/2 left-1/2 m-0 max-w-[94vw] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl p-5 text-foreground ${
          historyOpen ? "w-[51.5rem]" : "w-[27.5rem]"
        }`}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{task.title}</p>
            <p className="text-xs text-muted">{clientName}</p>
          </div>
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-hover hover:text-foreground"
          >
            {historyOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            History
          </button>
        </div>

        <div className="flex gap-4">
          <form id={formId} action={formAction} className="flex w-[25rem] shrink-0 flex-col gap-3">
            <input type="hidden" name="taskId" value={task.id} />
            <input type="hidden" name="actingRole" value={actingRole} />
            <input type="hidden" name="actingUserId" value={actingUserId} />

            {canManage ? (
              <>
                <input
                  name="title"
                  defaultValue={task.title}
                  required
                  className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm"
                />
                <Dropdown
                  name="projectId"
                  defaultValue={task.projectId}
                  options={projects.map((p) => ({ value: p.id, label: p.client.name }))}
                />
                <Dropdown
                  name="assignedToId"
                  defaultValue={task.assignedTo?.id ?? ""}
                  options={[{ value: "", label: "Unassigned" }, ...editors.map((e) => ({ value: e.id, label: e.name }))]}
                />
                <input
                  name="rawLink"
                  defaultValue={task.rawLink ?? ""}
                  placeholder="Raw footage (Google Drive link)"
                  className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm"
                />
                {(task.status === "sent_for_approval" || task.status === "revision_requested") && (
                  <input
                    name="frameioLink"
                    defaultValue={task.frameioLink ?? ""}
                    placeholder="Frame.io link"
                    className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm"
                  />
                )}
                {(task.status === "final_export_ready" || task.status === "delivered_and_uploaded") && (
                  <input
                    name="driveLink"
                    defaultValue={task.driveLink ?? ""}
                    placeholder="Final Drive link"
                    className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm"
                  />
                )}
                <div className="flex items-center gap-1.5 text-sm text-muted">
                  <NotesGlyph size={14} />
                  Editing notes
                </div>
                <textarea
                  name="editingNotes"
                  defaultValue={task.editingNotes ?? ""}
                  placeholder="Instructions, references, anything the editor needs…"
                  rows={6}
                  className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm"
                />
              </>
            ) : (
              // an editor sees everything but can only ever change the
              // Frame.io link — the rest is ops' input, read-only here
              <>
                {task.assignedTo && (
                  <div className="flex items-center gap-2 text-sm text-muted">
                    <Avatar name={task.assignedTo.name} />
                    {task.assignedTo.name}
                  </div>
                )}
                <div>
                  <p className="mb-1 text-xs text-muted">Raw footage</p>
                  {task.rawLink ? (
                    <a href={task.rawLink} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-400 underline underline-offset-2">
                      {task.rawLink}
                    </a>
                  ) : (
                    <p className="text-sm text-muted">—</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-sm text-muted">
                  <NotesGlyph size={14} />
                  Editing notes
                </div>
                <p className="whitespace-pre-wrap rounded-md border border-border bg-surface-2 px-3 py-2 text-sm">
                  {task.editingNotes ? linkify(task.editingNotes) : <span className="text-muted">None</span>}
                </p>
                {canEditFrameio && editingFrameio ? (
                  <input
                    name="frameioLink"
                    defaultValue={task.frameioLink ?? ""}
                    placeholder="Frame.io link"
                    autoFocus
                    className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm"
                  />
                ) : (
                  (canEditFrameio || task.frameioLink) && (
                    <div className="group/link">
                      <p className="mb-1 text-xs text-muted">Frame.io</p>
                      <div className="flex items-center gap-2">
                        {task.frameioLink ? (
                          <a
                            href={task.frameioLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="min-w-0 truncate text-sm text-blue-400 underline underline-offset-2"
                          >
                            {task.frameioLink}
                          </a>
                        ) : (
                          <p className="text-sm text-muted">—</p>
                        )}
                        {canEditFrameio && (
                          <button
                            type="button"
                            onClick={() => setEditingFrameio(true)}
                            title="Edit Frame.io link"
                            className="shrink-0 text-muted opacity-0 transition-opacity hover:text-foreground group-hover/link:opacity-100"
                          >
                            <Pencil size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                )}
              </>
            )}

            <p className="text-xs text-muted">
              Created {formatDateTime(task.createdAt)}
              {created && <> by {created.actorName}</>}
            </p>

            {state.error && <p className="text-sm text-red-300">{state.error}</p>}
          </form>

          {/* always rendered (not conditionally mounted) so the width
              transition below has real content to grow into/out of instead
              of content just appearing once there's room — that mismatch
              between "the box is still growing" and "the content already
              popped in" was the actual jump. The dialog's own width
              transition and this one run with the same duration, so the
              whole thing grows as one piece instead of the form column
              snapping to a new size the instant history opens. */}
          <div
            className={`shrink-0 overflow-hidden transition-all duration-300 ease-in-out ${
              historyOpen ? "w-[23rem] opacity-100" : "w-0 opacity-0"
            }`}
          >
            <div className="flex w-[23rem] flex-col gap-2">
              <p className="text-xs font-medium text-muted">Every stage this task has gone through</p>
              <div className="max-h-72 overflow-x-auto overflow-y-auto rounded-md border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface text-muted">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Date</th>
                      <th className="px-2 py-1.5 font-medium">Change</th>
                      <th className="px-2 py-1.5 font-medium">By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs === null ? (
                      <tr>
                        <td colSpan={3} className="px-2 py-2 text-muted">
                          Loading…
                        </td>
                      </tr>
                    ) : logs.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-2 py-2 text-muted">
                          No recorded activity.
                        </td>
                      </tr>
                    ) : (
                      logs.map((log, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="whitespace-nowrap px-2 py-1.5 text-muted">{formatDateTime(log.createdAt)}</td>
                          <td className="px-2 py-1.5">{log.action}</td>
                          <td className="px-2 py-1.5 text-muted">{log.actorName}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          {canManage ? (
            <>
              <form id={`delete-${task.id}`} action={deleteTask}>
                <input type="hidden" name="taskId" value={task.id} />
                <input type="hidden" name="actingRole" value={actingRole} />
              </form>
              <ConfirmButton
                message={`Delete "${task.title}"?`}
                className="rounded-md p-1.5 text-muted hover:text-red-400"
                formId={`delete-${task.id}`}
              >
                <Trash2 size={14} />
              </ConfirmButton>
            </>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => dialogRef.current?.close()} className="rounded-md px-3 py-1 text-sm btn-ghost">
              Close
            </button>
            {(canManage || canEditFrameio) && (
              <button type="submit" form={formId} disabled={pending} className="btn-glow rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60">
                {pending ? "Saving…" : "Save"}
              </button>
            )}
          </div>
        </div>
      </dialog>
  );
});
