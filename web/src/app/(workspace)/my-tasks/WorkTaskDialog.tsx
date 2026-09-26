"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Link2, MoreHorizontal, Paperclip, Plus, Trash2, User, X } from "lucide-react";
import { Dropdown } from "../Dropdown";
import { DatePicker } from "../DatePicker";
import { resizeToJpegMaxDim } from "@/lib/imageResize";
import { createWorkTask, updateWorkTask, deleteWorkTask, type WorkTaskLink, type WorkTaskAttachment } from "./actions";
import type { WorkTaskCardData } from "./WorkTaskCard";
import type { TaskTagOption } from "../TaskTagPicker";
import { useNewProject } from "../useNewProject";
import { ProjectChip, TagPill, pill } from "../composer";
import { Reveal } from "../Reveal";
import { ConfirmButton } from "../ConfirmButton";

// one definition, imported by the board, the list and the card — it was
// copied into all four, so widening it in one place broke the other three
export type Project = { id: string; name: string; client: { id: string; name: string } };


// One dialog handles both creating and editing — the fields are identical,
// only what happens on save (and whether a delete button shows) differs.
//
// A composer, the same as the board's: a title, a notes line, and a row of
// chips you touch only if they apply. Links and images wait behind "⋯",
// which opens by itself when a task being edited already has some.
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
  }
>(function WorkTaskDialog({ mode, task, projects, actingUserId, assignees = [], taskTags = [], canManageTags = false }, ref) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState(task?.title ?? "");
  const [tagIds, setTagIds] = useState<string[]>(task?.tags?.map((t) => t.id) ?? []);
  const [assignedToId, setAssignedToId] = useState(task?.assignedTo?.id ?? actingUserId);
  const [projectId, setProjectId] = useState(task?.projectId ?? "");
  const [clientId, setClientId] = useState(projects.find((p) => p.id === task?.projectId)?.client.id ?? "");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? "");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [links, setLinks] = useState<WorkTaskLink[]>(task?.links ?? []);
  const [attachments, setAttachments] = useState<WorkTaskAttachment[]>(task?.attachments ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);

  const hidden = links.filter((l) => l.url.trim()).length + attachments.length;
  const clients = [...new Map(projects.map((p) => [p.client.id, p.client])).values()].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const newProject = useNewProject(clientId, setProjectId);
  const clientProjects = newProject.withMade(projects).filter((p) => p.client.id === clientId);

  function open() {
    setTitle(task?.title ?? "");
    setTagIds(task?.tags?.map((t) => t.id) ?? []);
    setAssignedToId(task?.assignedTo?.id ?? actingUserId);
    setProjectId(task?.projectId ?? "");
    setClientId(projects.find((p) => p.id === task?.projectId)?.client.id ?? "");
    setDueDate(task?.dueDate ?? "");
    setNotes(task?.notes ?? "");
    setLinks(task?.links ?? []);
    setAttachments(task?.attachments ?? []);
    setError(null);
    // what's behind "⋯" shouldn't be hidden when there's something there
    setMore(!!task?.links?.length || !!task?.attachments?.length);
    newProject.cancel();
    dialogRef.current?.showModal();
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
      setError("Give it a title.");
      return;
    }
    setSaving(true);
    setError(null);
    const payload = { title, notes, tagIds, dueDate, clientId, projectId, links, attachments, assignedToId };
    const res =
      mode === "create" ? await createWorkTask(payload) : await updateWorkTask({ id: task!.id, ...payload });
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    dialogRef.current?.close();
    router.refresh();
  }

  async function remove() {
    if (!task) return;
    setSaving(true);
    const res = await deleteWorkTask(task.id);
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
      {mode === "create" && (
        <button
          onClick={open}
          className="btn btn-add flex w-full items-center justify-center gap-1.5"
        >
          <Plus size={16} /> New task
        </button>
      )}

      <dialog
        ref={dialogRef}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
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
          {/* borderless, so no focus ring — the caret says where you are */}
          <div className="flex flex-col gap-1.5 px-5 pt-5">
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs doing?"
              aria-label="Title"
              className="w-full bg-transparent text-lg font-medium text-foreground outline-none! placeholder:text-muted/60"
            />
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes…"
              aria-label="Notes"
              rows={1}
              className="field-sizing-content max-h-48 min-h-6 w-full resize-none bg-transparent text-sm text-foreground/90 outline-none! placeholder:text-muted/60"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5 px-5 pt-5 pb-4">
            {/* optional: plenty of this work belongs to no client at all */}
            <Dropdown
              pill={{ icon: <Building2 size={12} /> }}
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
                pill={{ icon: <User size={12} /> }}
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
            <DatePicker pill={{}} value={dueDate} onChange={setDueDate} placeholder="Due" />
            {taskTags.length > 0 && (
              <TagPill tags={taskTags} picked={tagIds} onChange={setTagIds} internal={false} canManage={canManageTags} />
            )}
            <button
              type="button"
              onClick={() => setMore((m) => !m)}
              aria-expanded={more}
              aria-label="Links and images"
              className={`${pill(more || hidden > 0)} px-2`}
            >
              <MoreHorizontal size={13} />
              {!more && hidden > 0 && <span className="tabular-nums">{hidden}</span>}
            </button>
          </div>

          <Reveal open={more}>
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
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setLinks((cur) => [...cur, { label: "", url: "" }])}
                  className={pill(false)}
                >
                  <Link2 size={12} /> Link
                </button>
                <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} className="hidden" />
                <button type="button" onClick={() => fileRef.current?.click()} className={pill(false)}>
                  <Paperclip size={12} /> Image
                </button>
              </div>
            </div>
          </Reveal>

          <div className="flex items-center gap-3 border-t border-border/60 px-5 py-3">
            {mode === "edit" && (
              <ConfirmButton
                message="Delete this task? It can't be undone."
                onConfirm={remove}
                className="btn btn-sm btn-ghost px-2 hover:text-red-300"
              >
                <Trash2 size={13} aria-label="Delete task" />
              </ConfirmButton>
            )}
            {/* only ever says something when something's wrong */}
            <p className="min-w-0 flex-1 truncate text-xs text-red-300">{error ?? newProject.error}</p>
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={() => dialogRef.current?.close()} className="btn btn-ghost">
                Cancel
              </button>
              <button disabled={saving} className="btn btn-glow disabled:opacity-60">
                {saving ? "Saving…" : mode === "create" ? "Add task" : "Save"}
              </button>
            </div>
          </div>
        </form>
      </dialog>
    </>
  );
});
