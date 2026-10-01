"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Paperclip, Trash2, User, X } from "lucide-react";
import { ADD_BUTTON, ADD_ROW, PlusBadge } from "../AddButton";
import { Dropdown } from "../Dropdown";
import { DatePicker } from "../DatePicker";
import { resizeToJpegMaxDim } from "@/lib/imageResize";
import { createWorkTask, updateWorkTask, deleteWorkTask, type WorkTaskLink, type WorkTaskAttachment } from "./actions";
import type { WorkTaskCardData } from "./WorkTaskCard";
import type { TaskTagOption } from "../TaskTagPicker";
import { useNewProject } from "../useNewProject";
import { ProjectChip } from "../composer";
import { TaskRecordPanel } from "../TaskRecordPanel";
import { Reveal } from "../Reveal";
import { ConfirmButton } from "../ConfirmButton";
import { keepDraft, readDraft } from "../draft";

// one definition, imported by the board, the list and the card — it was
// copied into all four, so widening it in one place broke the other three
export type Project = { id: string; name: string; client: { id: string; name: string } };

// what a new task keeps while it's being written (images aside: they're
// large, and kept only while the page is open)
type Draft = { title: string; notes: string; tagIds: string[]; dueDate: string; clientId: string; projectId: string; links: WorkTaskLink[]; assignedToId: string };


// One dialog handles both creating and editing — the fields are identical,
// only what happens on save (and whether a delete button shows) differs.
//
// A composer, the same as the board's: a title, a notes line, and a row of
// chips you touch only if they apply — links and images among them; what's
// been added shows under the row.
// Create mode renders its own "+ New task" trigger; edit mode has none of
// its own (the card it's attached to opens it via the ref, same pattern as
// TaskDetailsDialog on the client task board).
export const WorkTaskDialog = forwardRef<
  { open: () => void },
  {
    mode: "create" | "edit";
    task?: WorkTaskCardData;
    projects: Project[];
    actingUserId: string;
    // the people this person may hand work to — their own team for a core
    // member, everyone for admin, just themselves for an employee
    assignees?: { id: string; name: string }[];
    taskTags?: TaskTagOption[];
    canManageTags?: boolean;
    // create mode's own trigger: the board's button, or a list's first row
    trigger?: "button" | "row";
  }
>(function WorkTaskDialog({ mode, task, projects, actingUserId, assignees = [], canManageTags = false, trigger = "button" }, ref) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState(task?.title ?? "");
  const [tagIds, setTagIds] = useState<string[]>(task?.tags?.map((t) => t.id) ?? []);
  const [assignedToId, setAssignedToId] = useState(task?.assignedTo?.id ?? actingUserId);
  const [projectId, setProjectId] = useState(task?.projectId ?? "");
  const [clientId, setClientId] = useState(projects.find((p) => p.id === task?.projectId)?.client.id ?? "");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? "");
  // why the completion date is moving, when it is
  const [dateReason, setDateReason] = useState("");
  // bumped on each opening, so the record reloads
  const [openedAt, setOpenedAt] = useState(0);
  const dateMoved = mode === "edit" && !!task?.dueDate && dueDate !== task.dueDate;
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [links, setLinks] = useState<WorkTaskLink[]>(task?.links ?? []);
  const [attachments, setAttachments] = useState<WorkTaskAttachment[]>(task?.attachments ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A new task keeps what's been written until it's added or discarded:
  // closing it (the ×, Esc) only puts it away. The draft is read the first
  // time it opens, and kept from then on.
  const draftKey = `hq.draft.work-task.${actingUserId}`;
  const draftLoaded = useRef(false);
  const written = !!(title.trim() || notes.trim() || tagIds.length || dueDate || clientId || links.length || attachments.length);
  useEffect(() => {
    if (mode !== "create" || !draftLoaded.current) return;
    keepDraft(draftKey, written ? ({ title, notes, tagIds, dueDate, clientId, projectId, links, assignedToId } satisfies Draft) : null);
  }, [mode, draftKey, written, title, notes, tagIds, dueDate, clientId, projectId, links, assignedToId]);

  const clients = [...new Map(projects.map((p) => [p.client.id, p.client])).values()].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const newProject = useNewProject(clientId, setProjectId);
  const clientProjects = newProject.withMade(projects).filter((p) => p.client.id === clientId);

  // back to the task as saved, or for a new one, to nothing
  function reset() {
    setTitle(task?.title ?? "");
    setTagIds(task?.tags?.map((t) => t.id) ?? []);
    setAssignedToId(task?.assignedTo?.id ?? actingUserId);
    setProjectId(task?.projectId ?? "");
    setClientId(projects.find((p) => p.id === task?.projectId)?.client.id ?? "");
    setDueDate(task?.dueDate ?? "");
    setNotes(task?.notes ?? "");
    setLinks(task?.links ?? []);
    setAttachments(task?.attachments ?? []);
    newProject.cancel();
  }

  function open() {
    setDateReason("");
    setOpenedAt((n) => n + 1);
    if (mode === "edit") reset();
    else if (!draftLoaded.current) {
      draftLoaded.current = true;
      const d = readDraft<Draft>(draftKey);
      if (d) {
        setTitle(d.title ?? "");
        setNotes(d.notes ?? "");
        setTagIds(d.tagIds ?? []);
        setDueDate(d.dueDate ?? "");
        // only a client and project that are still current
        const project = projects.find((p) => p.id === d.projectId);
        setClientId(project?.client.id ?? (projects.some((p) => p.client.id === d.clientId) ? (d.clientId ?? "") : ""));
        setProjectId(project?.id ?? "");
        setLinks(d.links ?? []);
        if (d.assignedToId && (d.assignedToId === actingUserId || assignees.some((a) => a.id === d.assignedToId))) setAssignedToId(d.assignedToId);
      }
    }
    setError(null);
    dialogRef.current?.showModal();
  }

  // Cancel on a new task means throw it away; on an edit, leave it as saved
  function discard() {
    if (mode === "create") {
      reset();
      keepDraft(draftKey, null);
    }
    dialogRef.current?.close();
  }

  useImperativeHandle(ref, () => ({ open }));

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await resizeToJpegMaxDim(file, 640);
      setAttachments((cur) => [...cur, { name: file.name, dataUrl }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't process that image.");
    }
  }

  async function save() {
    if (!title.trim()) {
      setError("Please give it a title.");
      return;
    }
    setSaving(true);
    setError(null);
    const payload = { title, notes, tagIds, dueDate, clientId, projectId, links, attachments, assignedToId };
    const res =
      mode === "create" ? await createWorkTask(payload) : await updateWorkTask({ id: task!.id, ...payload, dateReason });
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    // added: the next one starts from nothing
    if (mode === "create") {
      reset();
      keepDraft(draftKey, null);
    }
    dialogRef.current?.close();
    router.refresh();
  }

  async function remove(reason: string) {
    if (!task) return;
    setSaving(true);
    const res = await deleteWorkTask(task.id, reason);
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    dialogRef.current?.close();
    router.refresh();
  }

  return (
    <>
      {mode === "create" &&
        (trigger === "row" ? (
          <button type="button" onClick={open} className={ADD_ROW}>
            <PlusBadge /> Add a task
          </button>
        ) : (
          <button type="button" onClick={open} className={`${ADD_BUTTON} w-full`}>
            <PlusBadge /> New task
          </button>
        ))}

      {/* no closing on a click outside: that's also how an open menu inside
          is dismissed, and it took everything written with it */}
      <dialog
        ref={dialogRef}
        className="glass fixed top-1/2 left-1/2 m-0 w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-0 text-foreground"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              save();
            }
          }}
          className="flex flex-col"
        >
          <div className="flex items-center justify-between px-5 pt-4">
            <p className="text-xs font-medium text-muted">{mode === "create" ? "New task" : "Edit task"}</p>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              aria-label="Close"
              className="-mr-1.5 flex size-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground"
            >
              <X size={15} />
            </button>
          </div>
          {/* borderless, so no focus ring — the caret says where you are */}
          <div className="flex flex-col gap-2 px-5 pt-2">
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs doing?"
              aria-label="Title"
              className="w-full bg-transparent text-xl font-medium tracking-tight text-foreground outline-none! placeholder:text-muted/50"
            />
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes…"
              aria-label="Notes"
              rows={1}
              className="field-sizing-content max-h-48 min-h-6 w-full resize-none bg-transparent text-sm leading-relaxed text-foreground/90 outline-none! placeholder:text-muted/50"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 px-5 pt-6 pb-5">
            {/* optional: plenty of this work belongs to no client at all */}
            <Dropdown
              pill={{ icon: <Building2 size={12} className="text-sky-400" /> }}
              value={clientId}
              placeholder="Client"
              options={[
                ...(clientId ? [{ value: "", label: "Not client work", pinned: true }] : []),
                ...clients.map((c) => ({ value: c.id, label: c.name })),
              ]}
              onChange={(id) => {
                setClientId(id);
                // the old project belonged to the old client
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
                canCreate={canManageTags}
              />
            )}
            {/* only when there's someone else to hand it to */}
            {assignees.length > 1 && (
              <Dropdown
                pill={{ icon: <User size={12} className="text-emerald-400" /> }}
                value={assignedToId}
                placeholder="Assignee"
                onChange={setAssignedToId}
                options={[
                  ...assignees.map((a) => ({ value: a.id, label: a.name })),
                  // someone who's left isn't offered, but a task still on
                  // them keeps showing their name
                  ...(task?.assignedTo && !assignees.some((a) => a.id === task.assignedTo.id)
                    ? [{ value: task.assignedTo.id, label: task.assignedTo.name }]
                    : []),
                ]}
              />
            )}
            <DatePicker pill={{}} value={dueDate} onChange={setDueDate} placeholder="Completion" />
            <span className="mx-0.5 h-4 w-px bg-white/[0.08]" aria-hidden />
            {/* one chip for anything attached: a link or an image */}
            <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} className="hidden" />
            <Dropdown
              pill={{ icon: <Paperclip size={12} className="text-teal-400" /> }}
              value=""
              placeholder={links.length + attachments.length ? `${links.length + attachments.length} attached` : "Attach"}
              onChange={(v) => (v === "link" ? setLinks((cur) => [...cur, { label: "", url: "" }]) : fileRef.current?.click())}
              options={[
                { value: "link", label: "Link" },
                { value: "image", label: "Image" },
              ]}
            />
          </div>

          {/* moving the completion date needs a reason, which is kept */}
          <Reveal open={dateMoved}>
            <div className="px-5 pb-3">
              <textarea
                value={dateReason}
                onChange={(e) => setDateReason(e.target.value)}
                rows={2}
                placeholder="Why is the completion date moving? This is kept on the task."
                className="w-full rounded-lg border border-amber-400/30 bg-amber-400/[0.05] px-3 py-2 text-sm text-foreground outline-none placeholder:text-amber-100/50 focus:border-amber-400/50"
              />
            </div>
          </Reveal>
          {mode === "edit" && task && (
            <div className="grid grid-cols-2 px-5 pb-4">
              <TaskRecordPanel key={openedAt} task={{ kind: "work", id: task.id }} createdAt={task.createdAt ?? new Date()} open={openedAt > 0} />
            </div>
          )}

          <Reveal open={links.length > 0 || attachments.length > 0}>
            <div className="flex flex-col gap-3 px-5 pb-4">
              {links.map((l, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={l.label}
                    onChange={(e) => setLinks((cur) => cur.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                    placeholder="Label"
                    className="w-24 shrink-0 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-foreground"
                  />
                  <input
                    value={l.url}
                    onChange={(e) => setLinks((cur) => cur.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                    placeholder="https://…"
                    className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => setLinks((cur) => cur.filter((_, j) => j !== i))}
                    aria-label="Remove link"
                    className="btn btn-xs btn-ghost px-2 hover:text-red-300"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {attachments.map((a, i) => (
                    <div key={i} className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border">
                      {/* eslint-disable-next-line @next/next/no-img-element -- a data: URI, not an optimizable remote asset */}
                      <img src={a.dataUrl} alt={a.name} className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setAttachments((cur) => cur.filter((_, j) => j !== i))}
                        aria-label={`Remove ${a.name}`}
                        className="absolute top-0.5 right-0.5 flex size-5 items-center justify-center rounded-full bg-black/70 text-white"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Reveal>

          <div className="flex items-center gap-3 border-t border-white/[0.06] px-5 py-3.5">
            {mode === "edit" && (
              <ConfirmButton
                message="Delete this task? It stays in History, with your reason."
                reason="Why is this being deleted?"
                onConfirm={remove}
                className="btn btn-sm btn-ghost px-2 hover:text-red-300"
              >
                <Trash2 size={13} aria-label="Delete task" />
              </ConfirmButton>
            )}
            {/* the shortcut, until something's wrong — then what's wrong */}
            {error || newProject.error ? (
              <p className="min-w-0 flex-1 truncate text-xs text-red-300">{error ?? newProject.error}</p>
            ) : (
              <p className="min-w-0 flex-1 truncate text-xs text-muted/70">
                Press Enter to {mode === "create" ? "add it" : "save"}
              </p>
            )}
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={discard} className="btn btn-ghost">
                {mode === "create" && written ? "Discard" : "Cancel"}
              </button>
              <button disabled={saving} className="btn btn-primary disabled:opacity-60">
                {saving ? "Saving…" : mode === "create" ? "Add task" : "Save"}
              </button>
            </div>
          </div>
        </form>
      </dialog>
    </>
  );
});
