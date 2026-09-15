"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { createTask, type TaskFormState } from "./actions";
import { NotesGlyph } from "./NotesButton";
import { Dropdown } from "./Dropdown";
import { DatePicker } from "./DatePicker";
import { ProjectField } from "./ProjectField";
import { TaskTagPicker, type TaskTagOption } from "./TaskTagPicker";

type Project = { id: string; name: string; client: { id: string; name: string } };
type Editor = { id: string; name: string };

const initialState: TaskFormState = {};

// A centred modal rather than the old inline <details> drawer: the form has
// six fields, and unfolding it inside a board column squeezed the column
// and pushed every card down the page.
export function NewTaskRow({
  projects,
  editors,
  defaultProjectId,
  taskTags = [],
}: {
  projects: Project[];
  editors: Editor[];
  taskTags?: TaskTagOption[];
  // pre-picks the project when this is embedded on that project's own page,
  // so adding a task there doesn't mean hunting it back out of the list
  defaultProjectId?: string;
}) {
  const [state, formAction, pending] = useActionState(createTask, initialState);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // the form posts as FormData, and DatePicker isn't a form control — it
  // keeps its value in state and writes it to a hidden input below
  const [dueDate, setDueDate] = useState("");
  const [internal, setInternal] = useState(false);
  const [scheduledFor, setScheduledFor] = useState("");
  const clients = useMemo(() => {
    const byId = new Map(projects.map((p) => [p.client.id, p.client.name]));
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [projects]);

  // close once the task actually lands, and clear the form (and the client
  // filter, so a re-open starts fully blank) so the next open doesn't show
  // the last thing that was added
  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing the form after a successful submit is the same reaction as formRef.reset() just above, not a render-loop
      setDueDate("");
      setScheduledFor("");
      dialogRef.current?.close();
    }
  }, [state.success]);

  const field = "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground";

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="btn-add flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm"
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
          {/* client first, then that client's projects — and a project can
              be created right here, since plenty of tasks are the first
              task of a project that doesn't exist yet */}
          <ProjectField projects={projects} defaultProjectId={defaultProjectId} clients={clients} />

          <label className="flex flex-col gap-1.5 text-xs text-muted">
            Video / subject
            <input name="title" placeholder="What needs editing?" required autoFocus className={field} />
          </label>

          <label className="flex flex-col gap-1.5 text-xs text-muted">
            Assign to
            <Dropdown name="assignedToId" placeholder="Assign to…" options={editors.map((e) => ({ value: e.id, label: e.name }))} />
          </label>

          <div className="flex flex-col gap-1.5 text-xs text-muted">
            Type of work
            <TaskTagPicker tags={taskTags} selected={[]} internal={internal} onInternalHint={setInternal} />
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

          <label className="flex flex-col gap-1.5 text-xs text-muted">
            Raw footage
            <input name="rawLink" placeholder="Google Drive link" className={field} />
          </label>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5 text-xs text-muted">
              Due date <span className="font-normal normal-case">(for client approval)</span>
              <input type="hidden" name="dueDate" value={dueDate} />
              <DatePicker value={dueDate} onChange={setDueDate} placeholder="No due date" />
            </div>

            <div className="flex flex-col gap-1.5 text-xs text-muted">
              Schedule for <span className="font-normal normal-case">(hidden from the editor until then)</span>
              <input type="hidden" name="scheduledFor" value={scheduledFor} />
              <DatePicker value={scheduledFor} onChange={setScheduledFor} placeholder="Visible immediately" />
            </div>
          </div>

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
