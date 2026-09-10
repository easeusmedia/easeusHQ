"use client";

import { useRef } from "react";
import { updateTask } from "./actions";
import { NotesGlyph } from "./NotesButton";
import { Dropdown } from "./Dropdown";
import type { Role } from "@/lib/workflow";
import type { TaskCardData } from "./TaskCard";

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

  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className="cursor-pointer hover:text-foreground">
        Edit
      </button>
      <dialog
        ref={ref}
        className="glass fixed top-1/2 left-1/2 m-0 w-72 -translate-x-1/2 -translate-y-1/2 rounded-xl p-4 text-foreground"
      >
        <form
          action={updateTask}
          onSubmit={() => ref.current?.close()}
          className="flex flex-col gap-2"
        >
          <input type="hidden" name="taskId" value={task.id} />
          <input type="hidden" name="actingRole" value={actingRole} />
          <input
            name="title"
            defaultValue={task.title}
            required
            className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs"
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
            className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs"
          />
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <NotesGlyph size={12} />
            Editing notes
          </div>
          <textarea
            name="editingNotes"
            defaultValue={task.editingNotes ?? ""}
            placeholder="Instructions, references, anything the editor needs…"
            rows={3}
            className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs"
          />
          <div className="mt-1 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => ref.current?.close()}
              className="rounded-md px-3 py-1 text-xs text-muted hover:bg-hover"
            >
              Cancel
            </button>
            <button type="submit" className="btn-glow rounded-md px-3 py-2 text-xs font-medium">
              Save
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
