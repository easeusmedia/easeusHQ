"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, useActionState } from "react";
import { ChevronRight, Pencil, Trash2 } from "lucide-react";
import { updateTask, deleteTask, getTaskActivity, type TaskFormState } from "./actions";
import { ConfirmButton } from "./ConfirmButton";
import { NotesGlyph, linkify } from "./NotesButton";
import { Dropdown } from "./Dropdown";
import { ProjectField } from "./ProjectField";
import { TaskTagPicker, type TaskTagOption } from "./TaskTagPicker";
import { Avatar, DueDate, formatDateTime, istDay } from "./TaskCard";
import { DatePicker } from "./DatePicker";
import type { Role, TaskStatus } from "@/lib/workflow";
import { STAGE } from "@/lib/stages";
import type { TaskCardData } from "./TaskCard";

const initialState: TaskFormState = {};

// same radius/padding/type-size the Dropdown's "md" uses, so a text row and
// a select row in this form are the same height and shape
const inputCls = "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm";

// a labelled row — the fields were bare boxes, so a URL sitting in one gave
// no clue which link it was
function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 text-xs text-muted ${wide ? "col-span-2" : ""}`}>
      {label}
      {children}
    </label>
  );
}

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
  projects: { id: string; name: string; client: { id: string; name: string } }[];
  actingUserId: string;
  actingRole: Role;
  taskTags?: TaskTagOption[];
}>(function TaskDetailsDialog({ task, clientName, editors, projects, actingUserId, actingRole, taskTags = [] }, ref) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState(updateTask, initialState);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[] | null>(null);
  const [editingFrameio, setEditingFrameio] = useState(false);
  const [internal, setInternal] = useState(task.internal);
  const [due, setDue] = useState(task.dueDate ? istDay(task.dueDate) : "");
  const [scheduled, setScheduled] = useState(task.scheduledFor ? istDay(task.scheduledFor) : "");

  const canManage = actingRole === "admin" || actingRole === "core";
  const isAssignee = task.assignedTo?.id === actingUserId;
  // only while it's actually under review — that's the one window an
  // editor has anything to fix on their own submission
  const canEditFrameio = !canManage && isAssignee && task.status === "sent_for_approval";

  function open() {
    dialogRef.current?.showModal();
    setEditingFrameio(false);
    // what's saved now, not what was typed before a Cancel
    setDue(task.dueDate ? istDay(task.dueDate) : "");
    setScheduled(task.scheduledFor ? istDay(task.scheduledFor) : "");
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

  // max-h: nothing capped the dialog's height before, so a task with a
  // long enough form (or a long enough history table) just grew past the
  // viewport — dialog positions via top-1/2 + -translate-y-1/2, not "fit
  // inside the screen", so the excess top and bottom both silently
  // vanished into overflow-hidden instead of scrolling. Each column below
  // scrolls internally now within that capped height.
  //
  // display:flex is NOT a Tailwind class here (see .dialog-grow[open] in
  // globals.css instead) — a native <dialog> without the `open` attribute
  // is hidden via the UA stylesheet's `dialog:not([open]) { display: none
  // }`, but that's the lowest-priority origin in the cascade: ANY author
  // CSS wins regardless of specificity, so a plain `flex` class here would
  // force every one of these dialogs to render at once, stacked, whether
  // or not it was ever actually opened. This bit us for real — every
  // task's own (closed) dialog was rendering on top of each other.
  return (
      <dialog
        ref={dialogRef}
        onClose={() => setHistoryOpen(false)}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        // the width eases open with the History panel (see .dialog-grow);
        // the panel grows by exactly what the dialog does, so the form
        // beside it never changes size on the way
        className={`dialog-grow glass fixed top-1/2 left-1/2 m-0 max-h-[85vh] max-w-[94vw] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl p-5 text-foreground ${
          historyOpen ? "w-[58rem]" : "w-[37rem]"
        }`}
      >
        <div className="mb-3 flex shrink-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{task.title}</p>
            <p className="text-xs text-muted">{clientName}</p>
          </div>
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-hover hover:text-foreground"
          >
            <ChevronRight size={13} className={`transition-transform duration-300 ${historyOpen ? "rotate-90" : ""}`} />
            History
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Two columns, so the form stops being one tall stack you have
              to scroll end to end. Short fields pair up; anything that
              needs the width (title, tags, notes) spans both. */}
          <form
            id={formId}
            action={formAction}
            // px-1, not pr-1: this is a scroll container, so it clips at
            // its own edges, and a field sitting flush against the left one
            // had its focus ring shaved off down that side the moment you
            // clicked into it. The padding is the room the ring needs.
            // w-[34rem] but free to shrink: the dialog is capped at the
            // window's width, and a form that couldn't shrink got cut off
            className="grid w-[34rem] min-w-0 shrink auto-rows-min grid-cols-2 gap-x-3 gap-y-2.5 overflow-y-auto px-1"
          >
            <input type="hidden" name="taskId" value={task.id} />
            <input type="hidden" name="actingRole" value={actingRole} />
            <input type="hidden" name="actingUserId" value={actingUserId} />

            {canManage ? (
              <>
                <Field label="Title" wide>
                  <input name="title" defaultValue={task.title} required className={inputCls} />
                </Field>
                {/* client first, then that client's projects, and a new
                    project can be created inline — same control the create
                    form uses, instead of one flat list of every project */}
                <ProjectField
                  projects={projects}
                  defaultProjectId={task.projectId}
                  clients={[...new Map(projects.map((p) => [p.client.id, p.client])).values()].sort((a, b) =>
                    a.name.localeCompare(b.name)
                  )}
                />
                <Field label="Assigned to">
                  <Dropdown
                    name="assignedToId"
                    defaultValue={task.assignedTo?.id ?? ""}
                    // the list is only people who can take new work; a task
                    // still on someone who's left keeps showing their name
                    options={[
                      { value: "", label: "Unassigned" },
                      ...editors.map((e) => ({ value: e.id, label: e.name })),
                      ...(task.assignedTo && !editors.some((e) => e.id === task.assignedTo!.id)
                        ? [{ value: task.assignedTo.id, label: task.assignedTo.name }]
                        : []),
                    ]}
                  />
                </Field>

                {/* Every link, at every stage. These used to appear only
                    while the task sat at the status each one belonged to,
                    which meant a Frame.io link you could see on the card was
                    not editable — or even visible — from here the moment the
                    task moved on. Ops can edit anything anyway, and a
                    per-status list is one more thing to forget when a stage
                    is added, which is exactly what happened. */}
                <Field label="Raw footage">
                  <input name="rawLink" defaultValue={task.rawLink ?? ""} placeholder="Google Drive link" className={inputCls} />
                </Field>
                {/* ops set when it's due and when the editor sees it;
                    an editor's own save never carries these */}
                <Field label="Due date">
                  <input type="hidden" name="dueDate" value={due} />
                  <DatePicker value={due} onChange={setDue} placeholder="No due date" />
                </Field>
                <Field label="Schedule for">
                  <input type="hidden" name="scheduledFor" value={scheduled} />
                  <DatePicker value={scheduled} onChange={setScheduled} placeholder="Visible immediately" />
                </Field>
                <Field label="Frame.io">
                  <input name="frameioLink" defaultValue={task.frameioLink ?? ""} placeholder="https://f.io/…" className={inputCls} />
                </Field>
                <Field label="Final Drive">
                  <input name="driveLink" defaultValue={task.driveLink ?? ""} placeholder="Google Drive link" className={inputCls} />
                </Field>
                {/* only for tasks that actually carry them — these come in
                    from Notion and would otherwise be invisible here */}
                {task.referenceLink !== null && (
                  <Field label="Reference">
                    <input name="referenceLink" defaultValue={task.referenceLink} className={inputCls} />
                  </Field>
                )}
                {task.assetLink !== null && (
                  <Field label="Assets">
                    <input name="assetLink" defaultValue={task.assetLink} className={inputCls} />
                  </Field>
                )}

                <div className="col-span-2 flex flex-col gap-1.5 text-xs text-muted">
                  Type of work
                  <TaskTagPicker
                    tags={taskTags}
                    selected={task.tags.map((t) => t.id)}
                    internal={internal}
                    onInternalHint={setInternal}
                  />
                  <label className="mt-1 flex cursor-pointer items-center gap-2 text-xs text-muted">
                    <input
                      type="checkbox"
                      checked={internal}
                      onChange={(e) => setInternal(e.target.checked)}
                      className="h-3.5 w-3.5 accent-current"
                    />
                    Internal work — the client never receives this
                  </label>
                </div>

                <div className="col-span-2 flex flex-col gap-1.5">
                  <span className="flex items-center gap-1.5 text-sm text-muted">
                    <NotesGlyph size={14} />
                    Editing notes
                  </span>
                  <textarea
                    name="editingNotes"
                    defaultValue={task.editingNotes ?? ""}
                    placeholder="Instructions, references, anything the editor needs…"
                    rows={3}
                    className={inputCls}
                  />
                </div>
              </>
            ) : (
              // an editor sees everything but can only ever change the
              // Frame.io link — the rest is ops' input, read-only here
              <div className="col-span-2 flex flex-col gap-3">
                {(task.assignedTo || task.dueDate) && (
                  <div className="flex items-center gap-2 text-sm text-muted">
                    {task.assignedTo && (
                      <>
                        <Avatar name={task.assignedTo.name} />
                        {task.assignedTo.name}
                      </>
                    )}
                    {task.dueDate && (
                      <span className="ml-auto">
                        <DueDate date={task.dueDate} done={task.status === "delivered_and_uploaded"} />
                      </span>
                    )}
                  </div>
                )}
                <div>
                  <p className="mb-1 text-xs text-muted">Raw footage</p>
                  {task.rawLink ? (
                    <a href={task.rawLink} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-400 underline underline-offset-2">
                      {task.rawLink}
                    </a>
                  ) : (
                    <p className="text-sm text-muted">None</p>
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
                          <p className="text-sm text-muted">None</p>
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
              </div>
            )}

            {state.error && <p className="col-span-2 text-sm text-red-300">{state.error}</p>}
          </form>

          {/* Beside the form, the same height as it. It slides open in step
              with the dialog's width: its content is a fixed width, pinned
              left, so nothing inside reflows while it grows, and it's
              absolutely placed, so it never makes the dialog taller — a
              long trail scrolls inside it instead. */}
          <div
            inert={!historyOpen}
            className={`relative shrink-0 overflow-hidden transition-[width,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              historyOpen ? "w-[min(21rem,40vw)] opacity-100" : "w-0 opacity-0"
            }`}
          >
            <div className="absolute inset-y-0 left-0 flex w-[min(21rem,40vw)] flex-col gap-2 pl-4">
              <p className="shrink-0 text-xs font-medium text-muted">Every stage this task has gone through</p>
              <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border p-3">
                <TaskHistory logs={logs} />
              </div>
            </div>
          </div>
        </div>

        {canManage && (
          <form id={`delete-${task.id}`} action={deleteTask}>
            <input type="hidden" name="taskId" value={task.id} />
            <input type="hidden" name="actingRole" value={actingRole} />
          </form>
        )}
        {/* Outside both columns, so it sits on one line under them rather
            than riding the form's scroll and ending at a different height
            than the history panel beside it. */}
        <div className="mt-3 flex shrink-0 items-center gap-3 border-t border-border pt-3">
          {canManage ? (
            <ConfirmButton
              message={`Delete "${task.title}"?`}
              className="shrink-0 rounded-md p-1.5 text-muted hover:text-red-400"
              formId={`delete-${task.id}`}
            >
              <Trash2 size={14} />
            </ConfirmButton>
          ) : (
            <span />
          )}
          <p className="min-w-0 flex-1 truncate text-xs text-muted">
            Created {formatDateTime(task.createdAt)}
            {created && <> by {created.actorName}</>}
          </p>
          <div className="flex shrink-0 gap-2">
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

const stageName = (s: string) => STAGE[s as TaskStatus]?.label ?? s;

// The trail as a timeline, newest last: what changed in words ("Editing →
// Sent for approval", not the stored keys), then who and when underneath.
// One column that wraps, so nothing is ever cut off at the panel's edge.
function TaskHistory({ logs }: { logs: LogEntry[] | null }) {
  if (logs === null) return <p className="text-xs text-muted">Loading…</p>;
  if (logs.length === 0) return <p className="text-xs text-muted">No recorded activity.</p>;
  return (
    <ol>
      {logs.map((log, i) => {
        const [from, to] = log.action.split(" → ");
        return (
          <li key={i} className="relative border-l border-border pb-4 pl-4 last:border-transparent last:pb-0">
            <span
              className={`absolute -left-[4.5px] top-1 h-2 w-2 rounded-full ring-2 ring-background ${
                to ? (STAGE[to as TaskStatus]?.dot ?? "bg-neutral-400") : "bg-neutral-400"
              }`}
            />
            <p className="text-sm leading-snug">
              {to ? (
                <>
                  {stageName(from)} <span className="text-muted">→</span> {stageName(to)}
                </>
              ) : log.action === "created" ? (
                "Created"
              ) : (
                log.action
              )}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {log.actorName} · {formatDateTime(log.createdAt)}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
