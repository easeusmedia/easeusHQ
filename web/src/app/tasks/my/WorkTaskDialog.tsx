"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Link2, Paperclip, Trash2 } from "lucide-react";
import { Dropdown } from "../Dropdown";
import { resizeToJpegMaxDim } from "@/lib/imageResize";
import { createWorkTask, updateWorkTask, deleteWorkTask, type WorkTaskLink, type WorkTaskAttachment } from "./actions";
import type { WorkTaskCardData } from "./WorkTaskCard";

type Project = { id: string; name: string; client: { name: string } };

const field = "w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-foreground";
const label = "flex flex-col gap-1.5 text-sm text-muted";
// a real button, not a bare text link — "+ Add a link"/"+ Add an image"
// used to be plain underline-less text with no padding at all, which read
// as inert and was genuinely fiddly to hit
const addBtn = "btn-add flex w-fit items-center gap-1.5 rounded-lg px-3 py-2 text-sm";

// One dialog handles both creating and editing — the fields are identical,
// only what happens on save (and whether a delete button shows) differs.
// Create mode renders its own "+ New task" trigger; edit mode has none of
// its own (the card it's attached to opens it via the ref, same pattern as
// TaskDetailsDialog on the client task board).
export const WorkTaskDialog = forwardRef<
  { open: () => void },
  { mode: "create" | "edit"; task?: WorkTaskCardData; projects: Project[]; actingUserId: string }
>(function WorkTaskDialog({ mode, task, projects, actingUserId }, ref) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState(task?.title ?? "");
  const [category, setCategory] = useState(task?.category ?? "");
  const [projectId, setProjectId] = useState(task?.projectId ?? "");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? "");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [links, setLinks] = useState<WorkTaskLink[]>(task?.links ?? []);
  const [attachments, setAttachments] = useState<WorkTaskAttachment[]>(task?.attachments ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open() {
    setTitle(task?.title ?? "");
    setCategory(task?.category ?? "");
    setProjectId(task?.projectId ?? "");
    setDueDate(task?.dueDate ?? "");
    setNotes(task?.notes ?? "");
    setLinks(task?.links ?? []);
    setAttachments(task?.attachments ?? []);
    setError(null);
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
    const payload = { title, notes, category, dueDate, projectId, links, attachments };
    const res =
      mode === "create"
        ? await createWorkTask({ actingUserId, ...payload })
        : await updateWorkTask({ id: task!.id, ...payload });
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
          className="btn-add flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm"
        >
          <Plus size={16} /> New task
        </button>
      )}

      <dialog
        ref={dialogRef}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="glass fixed top-1/2 left-1/2 m-0 max-h-[85vh] w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl p-6 text-foreground"
      >
        <h2 className="mb-5 text-lg font-semibold">{mode === "create" ? "New task" : "Edit task"}</h2>
        <div className="flex flex-col gap-4">
          <label className={label}>
            Title
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs doing?"
              className={field}
            />
          </label>

          {/* stacked, not side-by-side — a "Category (optional)" label next
              to "Due date" in a two-column row had no room to stay on one
              line and wrapped mid-label */}
          <label className={label}>
            Category <span className="font-normal normal-case text-muted/70">(optional)</span>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Audio, graphics, research…"
              className={field}
            />
          </label>

          <label className={label}>
            Due date
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={field} />
          </label>

          <label className={label}>
            Related project <span className="font-normal normal-case text-muted/70">(optional)</span>
            <Dropdown
              defaultValue={projectId}
              placeholder="None"
              onChange={setProjectId}
              options={projects.map((p) => ({ value: p.id, label: `${p.client.name} · ${p.name}` }))}
            />
          </label>

          <label className={label}>
            Notes
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Whatever the next person picking this up needs to know…"
              rows={3}
              className={field}
            />
          </label>

          <div className={label}>
            <span className="flex items-center gap-1.5">
              <Link2 size={14} /> Links
            </span>
            {links.map((l, i) => (
              <div key={i} className="flex gap-2">
                {/* not `field` here — it bakes in w-full, and a later w-24/
                    flex-1 in the same class list doesn't reliably beat it
                    (both are "width" utilities; Tailwind's own internal
                    ordering decides the tie, not source order — it went to
                    w-full, which is exactly what broke this row) */}
                <input
                  value={l.label}
                  onChange={(e) => setLinks((cur) => cur.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                  placeholder="Label"
                  className="w-24 shrink-0 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-foreground"
                />
                <input
                  value={l.url}
                  onChange={(e) => setLinks((cur) => cur.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                  placeholder="https://…"
                  // min-w-0: a flex item's default min-width is its content's
                  // intrinsic width, not 0 — without it this still refuses
                  // to shrink and pushes the row past the dialog's edge
                  className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-foreground"
                />
                <button
                  type="button"
                  onClick={() => setLinks((cur) => cur.filter((_, j) => j !== i))}
                  title="Remove link"
                  className="flex shrink-0 items-center justify-center rounded-lg border border-transparent p-2.5 text-muted hover:border-border hover:bg-surface-2 hover:text-red-400"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
            <button type="button" onClick={() => setLinks((cur) => [...cur, { label: "", url: "" }])} className={addBtn}>
              <Plus size={14} /> Add a link
            </button>
          </div>

          <div className={label}>
            <span className="flex items-center gap-1.5">
              <Paperclip size={14} /> Attachments
            </span>
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attachments.map((a, i) => (
                  <div key={i} className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-border">
                    {/* eslint-disable-next-line @next/next/no-img-element -- a data: URI, not an optimizable remote asset */}
                    <img src={a.dataUrl} alt={a.name} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setAttachments((cur) => cur.filter((_, j) => j !== i))}
                      title="Remove attachment"
                      className="absolute inset-0 flex items-center justify-center bg-black/60 text-white opacity-0 group-hover:opacity-100"
                    >
                      <X size={18} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} className="hidden" />
            <button type="button" onClick={() => fileRef.current?.click()} className={addBtn}>
              <Plus size={14} /> Add an image
            </button>
          </div>

          {error && <p className="text-sm text-red-300">{error}</p>}

          <div className="mt-1 flex items-center justify-between gap-2">
            {mode === "edit" ? (
              <button
                type="button"
                onClick={remove}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm text-muted hover:bg-surface-2 hover:text-red-400 disabled:opacity-60"
              >
                <Trash2 size={15} /> Delete
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                className="btn-ghost rounded-lg px-4 py-2.5 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="btn-glow rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-60"
              >
                {saving ? "Saving…" : mode === "create" ? "Add task" : "Save"}
              </button>
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
});
