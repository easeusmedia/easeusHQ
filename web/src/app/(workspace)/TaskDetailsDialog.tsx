"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, useActionState } from "react";
import {
  BookOpen,
  Building2,
  CalendarClock,
  ChevronRight,
  Clapperboard,
  ExternalLink,
  FolderCheck,
  Link2,
  MoreHorizontal,
  Package,
  Pencil,
  Trash2,
  User,
} from "lucide-react";
import { updateTask, deleteTask, getTaskActivity, type TaskFormState } from "./actions";
import { ConfirmButton } from "./ConfirmButton";
import { NotesGlyph, linkify } from "./NotesButton";
import { Dropdown } from "./Dropdown";
import { type TaskTagOption } from "./TaskTagPicker";
import { Avatar, DueDate, STATUS_LABEL, formatDate, formatDateTime, istDay } from "./TaskCard";
import { ProjectChip, TagPill, pill } from "./composer";
import { useNewProject } from "./useNewProject";
import { Reveal } from "./Reveal";
import { daysLate, handoffUnknown } from "@/lib/due";
import { DatePicker } from "./DatePicker";
import type { Role } from "@/lib/workflow";
import { StageTrail } from "./StageTrail";
import type { TaskCardData } from "./TaskCard";
import { Checkbox } from "./Checkbox";

const initialState: TaskFormState = {};

// One link: what it is, the address, and a way to open it. Borderless inside
// the links block, so five of them read as one list, not five boxes.
function LinkRow({
  icon,
  label,
  name,
  value,
  placeholder,
}: {
  icon: React.ReactNode;
  label: string;
  name: string;
  value: string | null;
  placeholder?: string;
}) {
  return (
    <label className="flex items-center gap-2.5 px-3 py-2 not-first:border-t not-first:border-border/40">
      <span className="flex shrink-0">{icon}</span>
      <span className="w-24 shrink-0 text-xs text-muted">{label}</span>
      <input
        name={name}
        defaultValue={value ?? ""}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none! placeholder:text-muted/50"
      />
      {value && (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          title={`Open ${label}`}
          className="shrink-0 text-muted transition-colors hover:text-foreground"
        >
          <ExternalLink size={13} />
        </a>
      )}
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
  const clientOf = (id: string | null) => projects.find((p) => p.id === id)?.client.id ?? "";
  const [clientId, setClientId] = useState(clientOf(task.projectId));
  const [projectId, setProjectId] = useState(task.projectId ?? "");
  const [assignee, setAssignee] = useState(task.assignedTo?.id ?? "");
  const [tagIds, setTagIds] = useState(task.tags.map((t) => t.id));
  const [more, setMore] = useState(false);
  const newProject = useNewProject(clientId, setProjectId);
  const clientProjects = newProject.withMade(projects).filter((p) => p.client.id === clientId);
  const clients = [...new Map(projects.map((p) => [p.client.id, p.client])).values()].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  // set behind "⋯", counted on it so it isn't forgotten
  const tucked = [scheduled, internal].filter(Boolean).length;

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
    setClientId(clientOf(task.projectId));
    setProjectId(task.projectId ?? "");
    setAssignee(task.assignedTo?.id ?? "");
    setTagIds(task.tags.map((t) => t.id));
    setInternal(task.internal);
    setMore(false);
    newProject.cancel();
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
          {canManage ? (
            // the title's the first field below; up here, just where it stands
            <p className="pt-1 text-xs text-muted">{STATUS_LABEL[task.status]}</p>
          ) : (
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{task.title}</p>
              <p className="text-xs text-muted">{clientName}</p>
            </div>
          )}
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
              // The composer's layout, not a form: the title and notes as
              // plain text, every property a chip, the links in one quiet
              // block. It used to be eleven labelled boxes and every tag at
              // once — the whole task shouted at you on open.
              <div className="col-span-2 flex flex-col gap-4">
                <input type="hidden" name="clientId" value={clientId} />
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="dueDate" value={due} />
                <input type="hidden" name="scheduledFor" value={scheduled} />
                <input type="hidden" name="tagsPresent" value="1" />
                {tagIds.map((id) => (
                  <input key={id} type="hidden" name="tagIds" value={id} />
                ))}
                <input type="hidden" name="internal" value={internal ? "on" : ""} />

                <div className="flex flex-col gap-1.5">
                  <input
                    name="title"
                    defaultValue={task.title}
                    required
                    placeholder="Title"
                    aria-label="Title"
                    className="w-full bg-transparent text-lg font-medium text-foreground outline-none! placeholder:text-muted/60"
                  />
                  <textarea
                    name="editingNotes"
                    defaultValue={task.editingNotes ?? ""}
                    placeholder="Notes for the editor…"
                    aria-label="Editing notes"
                    rows={1}
                    className="field-sizing-content max-h-48 min-h-6 w-full resize-none bg-transparent text-sm text-foreground/90 outline-none! placeholder:text-muted/60"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Dropdown
                      pill={{ icon: <Building2 size={12} className="text-sky-400" /> }}
                      value={clientId}
                      placeholder="Client"
                      options={clients.map((c) => ({ value: c.id, label: c.name }))}
                      onChange={(id) => {
                        // the old project belonged to the old client
                        setClientId(id);
                        setProjectId("");
                        newProject.cancel();
                      }}
                    />
                    {clientId && (
                      <ProjectChip
                        value={projectId}
                        onChange={setProjectId}
                        projects={clientProjects}
                        newProject={newProject}
                        canCreate
                      />
                    )}
                    <Dropdown
                      name="assignedToId"
                      pill={{ icon: <User size={12} className="text-emerald-400" /> }}
                      value={assignee}
                      placeholder="Assignee"
                      onChange={setAssignee}
                      // only people who can take new work; a task still on
                      // someone who's left keeps showing their name
                      options={[
                        { value: "", label: "Unassigned" },
                        ...editors.map((e) => ({ value: e.id, label: e.name })),
                        ...(task.assignedTo && !editors.some((e) => e.id === task.assignedTo!.id)
                          ? [{ value: task.assignedTo.id, label: task.assignedTo.name }]
                          : []),
                      ]}
                    />
                    <DatePicker pill={{}} value={due} onChange={setDue} placeholder="Due" />
                    {taskTags.length > 0 && (
                      <TagPill
                        tags={taskTags}
                        picked={tagIds}
                        onChange={setTagIds}
                        internal={internal}
                        onInternalHint={setInternal}
                        canManage
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => setMore((m) => !m)}
                      aria-expanded={more}
                      aria-label="More options"
                      className={`${pill(more || tucked > 0)} px-2`}
                    >
                      <MoreHorizontal size={13} />
                      {!more && tucked > 0 && <span className="tabular-nums">{tucked}</span>}
                    </button>
                  </div>
                  <Reveal open={more}>
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <DatePicker
                        pill={{ icon: <CalendarClock size={12} className="text-orange-400" /> }}
                        value={scheduled}
                        onChange={setScheduled}
                        placeholder="Hide until…"
                      />
                      <label className={`${pill(internal)} cursor-pointer`}>
                        <Checkbox checked={internal} onChange={setInternal} label="Internal work" size={13} />
                        Internal
                      </label>
                    </div>
                  </Reveal>
                  <HandoffNote dueDate={task.dueDate} handedOffAt={task.handedOffAt} createdAt={task.createdAt} />
                </div>

                {/* Every link, at every stage — they used to appear only
                    while the task sat at the stage each belonged to. Ops can
                    edit anything, so all of them are always here. Reference
                    and Assets only when the task has one (from Notion). */}
                <div className="overflow-hidden rounded-xl bg-foreground/[0.03]">
                  <LinkRow icon={<Link2 size={13} className="text-blue-400" />} label="Raw footage" name="rawLink" value={task.rawLink} placeholder="Google Drive link" />
                  <LinkRow icon={<Clapperboard size={13} className="text-violet-400" />} label="Frame.io" name="frameioLink" value={task.frameioLink} placeholder="https://f.io/…" />
                  <LinkRow icon={<FolderCheck size={13} className="text-emerald-400" />} label="Final Drive" name="driveLink" value={task.driveLink} placeholder="Google Drive link" />
                  {task.referenceLink !== null && (
                    <LinkRow icon={<BookOpen size={13} className="text-amber-400" />} label="Reference" name="referenceLink" value={task.referenceLink} />
                  )}
                  {task.assetLink !== null && (
                    <LinkRow icon={<Package size={13} className="text-rose-400" />} label="Assets" name="assetLink" value={task.assetLink} />
                  )}
                </div>
              </div>
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
                        <DueDate date={task.dueDate} handedOffAt={task.handedOffAt} />
                      </span>
                    )}
                  </div>
                )}
                <HandoffNote dueDate={task.dueDate} handedOffAt={task.handedOffAt} createdAt={task.createdAt} />
                <div>
                  <p className="mb-1 text-xs text-muted">Raw footage</p>
                  {task.rawLink ? (
                    <a href={task.rawLink} target="_blank" rel="noopener noreferrer" className="text-sm text-sky-300 underline decoration-sky-300/40 underline-offset-2 hover:decoration-sky-300">
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
                            className="min-w-0 truncate text-sm text-sky-300 underline decoration-sky-300/40 underline-offset-2 hover:decoration-sky-300"
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
                <StageTrail logs={logs} />
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
            <button type="button" onClick={() => dialogRef.current?.close()} className="btn btn-ghost">
              Close
            </button>
            {(canManage || canEditFrameio) && (
              <button type="submit" form={formId} disabled={pending} className="btn btn-primary disabled:opacity-60">
                {pending ? "Saving…" : "Save"}
              </button>
            )}
          </div>
        </div>
      </dialog>
  );
});

// Once it's reached the client the chip on the card is gone — the deadline
// has done its job — but how it went is still worth reading here: the day it
// got there, and whether that was in time.
function HandoffNote({
  dueDate,
  handedOffAt,
  createdAt,
}: {
  dueDate: Date | null;
  handedOffAt: Date | null;
  createdAt: Date;
}) {
  if (!dueDate || !handedOffAt) return null;
  // came in from Notion already with the client: when it got there is
  // unknown, and guessing would call it late
  if (handoffUnknown(createdAt, handedOffAt)) {
    return <p className="text-xs text-muted">Was already with the client when it came in from Notion.</p>;
  }
  const late = daysLate(dueDate, handedOffAt);
  return (
    <p className="text-xs text-muted">
      Reached the client {formatDate(handedOffAt)} —{" "}
      {late ? <span className="text-red-300">{late} day{late === 1 ? "" : "s"} late</span> : "on time"}
    </p>
  );
}
