"use client";

import { useActionState, useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import { createTask, type TaskFormState } from "./actions";
import { NotesGlyph } from "./NotesButton";
import { Dropdown } from "./Dropdown";

type Project = { id: string; client: { name: string } };
type Editor = { id: string; name: string };

const initialState: TaskFormState = {};

// A centred modal rather than the old inline <details> drawer: the form has
// six fields, and unfolding it inside a board column squeezed the column
// and pushed every card down the page.
export function NewTaskRow({ projects, editors }: { projects: Project[]; editors: Editor[] }) {
  const [state, formAction, pending] = useActionState(createTask, initialState);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // close once the task actually lands, and clear the form so the next open
  // starts blank instead of showing the last thing that was added
  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      dialogRef.current?.close();
    }
  }, [state.success]);

  const field = "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground";

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-foreground"
      >
        <Plus size={15} /> New task
      </button>

      <dialog
        ref={dialogRef}
        onClick={(e) => {
          // click the backdrop (the dialog element itself, outside the
          // inner panel) to dismiss
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="glass fixed top-1/2 left-1/2 m-0 w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6 text-foreground"
      >
        <h2 className="mb-4 text-base font-semibold">New task</h2>
        <form ref={formRef} action={formAction} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-xs text-muted">
            Client
            <Dropdown name="projectId" placeholder="Client…" options={projects.map((p) => ({ value: p.id, label: p.client.name }))} />
          </label>

          <label className="flex flex-col gap-1.5 text-xs text-muted">
            Video / subject
            <input name="title" placeholder="What needs editing?" required autoFocus className={field} />
          </label>

          <label className="flex flex-col gap-1.5 text-xs text-muted">
            Assign to
            <Dropdown name="assignedToId" placeholder="Assign to…" options={editors.map((e) => ({ value: e.id, label: e.name }))} />
          </label>

          <label className="flex flex-col gap-1.5 text-xs text-muted">
            Raw footage
            <input name="rawLink" placeholder="Google Drive link" className={field} />
          </label>

          <label className="flex flex-col gap-1.5 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <NotesGlyph size={12} /> Editing notes
            </span>
            <textarea
              name="editingNotes"
              placeholder="Instructions, references, anything the editor needs…"
              rows={3}
              className={field}
            />
          </label>

          {state.error && <p className="text-xs text-red-300">{state.error}</p>}

          <div className="mt-1 flex justify-end gap-2">
            <button type="button" onClick={() => dialogRef.current?.close()} className="btn-ghost rounded-lg px-4 py-2 text-xs">
              Cancel
            </button>
            <button disabled={pending} className="btn-glow rounded-lg px-4 py-2 text-xs font-medium disabled:opacity-60">
              {pending ? "Adding…" : "Add task"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
