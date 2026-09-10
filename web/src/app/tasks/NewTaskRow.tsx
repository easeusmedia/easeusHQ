"use client";

import { useActionState } from "react";
import { createTask, type TaskFormState } from "./actions";
import { NotesGlyph } from "./NotesButton";
import { Dropdown } from "./Dropdown";

type Project = { id: string; client: { name: string } };
type Editor = { id: string; name: string };

const initialState: TaskFormState = {};

// native <details> gives us a collapsible "add task" affordance for free —
// no client JS, no modal component needed
export function NewTaskRow({ projects, editors }: { projects: Project[]; editors: Editor[] }) {
  const [state, formAction, pending] = useActionState(createTask, initialState);

  return (
    <details className="rounded-lg border border-dashed border-border bg-surface/50 p-2 text-sm">
      <summary className="cursor-pointer font-medium text-foreground">+ New task</summary>
      <form action={formAction} className="mt-2 flex flex-col gap-2">
        <Dropdown name="projectId" placeholder="Client…" options={projects.map((p) => ({ value: p.id, label: p.client.name }))} />
        <input
          name="title"
          placeholder="Video / subject"
          required
          className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs"
        />
        <Dropdown name="assignedToId" placeholder="Assign to…" options={editors.map((e) => ({ value: e.id, label: e.name }))} />
        <input
          name="rawLink"
          placeholder="Raw footage (Google Drive link)"
          className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs"
        />
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <NotesGlyph size={12} />
          Editing notes
        </div>
        <textarea
          name="editingNotes"
          placeholder="Instructions, references, anything the editor needs…"
          rows={3}
          className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs"
        />
        {state.error && <p className="text-xs text-red-300">{state.error}</p>}
        <button disabled={pending} className="btn-glow rounded-md px-3 py-2 text-xs font-medium disabled:opacity-60">
          {pending ? "Adding…" : "Add task"}
        </button>
      </form>
    </details>
  );
}
