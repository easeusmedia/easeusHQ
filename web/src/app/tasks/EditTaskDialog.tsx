"use client";

import { useActionState, useEffect, useRef } from "react";
import { updateTask, type TaskFormState } from "./actions";
import { NotesGlyph } from "./NotesButton";
import { Dropdown } from "./Dropdown";
import type { Role } from "@/lib/workflow";
import type { TaskCardData } from "./TaskCard";

const initialState: TaskFormState = {};

// Native <dialog> instead of an absolutely-positioned popup — the popup
// version could end up visually (and click-wise) behind a neighboring
// card's content, since plain position:absolute doesn't guarantee it paints
// above unrelated siblings. A <dialog> opened via showModal() always sits
// in the browser's top layer, above everything else, no exceptions.
export function EditTaskDialog({
  task,
  editors,
  projects,
  actingRole,
}: {
  task: TaskCardData;
  editors: { id: string; name: string }[];
  projects: { id: string; client: { name: string } }[];
  actingRole: Role;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState(updateTask, initialState);

  // only close on an actual successful save — a validation error (a bad
  // link, a missing title) should leave the dialog open so it's visible
  useEffect(() => {
    if (state.success) ref.current?.close();
  }, [state]);

  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className="cursor-pointer hover:text-foreground">
        Edit
      </button>
      <dialog
        ref={ref}
        className="glass fixed top-1/2 left-1/2 m-0 w-[32rem] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 rounded-xl p-5 text-foreground"
      >
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="taskId" value={task.id} />
          <input type="hidden" name="actingRole" value={actingRole} />
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
          {state.error && <p className="text-sm text-red-300">{state.error}</p>}
          <div className="mt-1 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => ref.current?.close()}
              className="rounded-md px-3 py-1 text-sm btn-ghost"
            >
              Cancel
            </button>
            <button type="submit" disabled={pending} className="btn-glow rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60">
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
