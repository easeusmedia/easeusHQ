"use client";

import { useActionState, useEffect, useMemo, useRef, useState, startTransition } from "react";
import { Plus } from "lucide-react";
import { createTask, type TaskFormState } from "./actions";
import { NotesGlyph } from "./NotesButton";
import { Dropdown } from "./Dropdown";
import { DatePicker } from "./DatePicker";
import { ProjectField } from "./ProjectField";
import { TaskTagPicker, type TaskTagOption } from "./TaskTagPicker";
import { Checkbox } from "./Checkbox";

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
  // bumped after a task lands, to start the next one from a blank form —
  // including the client/project picker and tags, which keep their own state
  const [formKey, setFormKey] = useState(0);

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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing the form after a successful submit is a reaction to it landing, not a render-loop
      setDueDate("");
      setScheduledFor("");
      setInternal(false);
      setFormKey((k) => k + 1);
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
        className="glass fixed top-1/2 left-1/2 m-0 max-h-[88vh] w-[min(37rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl p-6 text-foreground"
      >
        <h2 className="mb-4 text-base font-semibold">New task</h2>
        {/* two columns, same as the details dialog — nine stacked fields
            made this a scroll from top to bottom */}
        <form
          key={formKey}
          ref={formRef}
          // submitted by hand rather than through the form's `action`: React
          // resets an action form on every submit, so one missing field used
          // to wipe everything already typed. Nothing is cleared until the
          // task actually lands (the effect above).
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            startTransition(() => formAction(data));
          }}
          className="grid auto-rows-min grid-cols-2 gap-x-3 gap-y-2.5"
        >
          {/* client first, then that client's projects — and a project can
              be created right here, since plenty of tasks are the first
              task of a project that doesn't exist yet */}
          <ProjectField projects={projects} defaultProjectId={defaultProjectId} clients={clients} />

          <label className="col-span-2 flex flex-col gap-1.5 text-xs text-muted">
            Video / subject
            <input name="title" placeholder="What needs editing?" required autoFocus className={field} />
          </label>

          <label className="flex min-w-0 flex-col gap-1.5 text-xs text-muted">
            Assign to
            <Dropdown
              name="assignedToId"
              placeholder="Assign to…"
              // an editor's only choice is themselves, so it's already made
              defaultValue={editors.length === 1 ? editors[0].id : undefined}
              options={editors.map((e) => ({ value: e.id, label: e.name }))}
            />
          </label>

          <label className="flex min-w-0 flex-col gap-1.5 text-xs text-muted">
            Raw footage
            <input name="rawLink" placeholder="Google Drive link" className={field} />
          </label>

            <div className="flex min-w-0 flex-col gap-1.5 text-xs text-muted">
              Due date <span className="font-normal normal-case">(for client approval)</span>
              <input type="hidden" name="dueDate" value={dueDate} />
              <DatePicker value={dueDate} onChange={setDueDate} placeholder="No due date" />
            </div>

            <div className="flex min-w-0 flex-col gap-1.5 text-xs text-muted">
              Schedule for <span className="font-normal normal-case">(hidden from the editor until then)</span>
              <input type="hidden" name="scheduledFor" value={scheduledFor} />
              <DatePicker value={scheduledFor} onChange={setScheduledFor} placeholder="Visible immediately" />
            </div>

          <div className="col-span-2 flex flex-col gap-1.5 text-xs text-muted">
            Type of work
            <TaskTagPicker tags={taskTags} selected={[]} internal={internal} onInternalHint={setInternal} />
            <label className="mt-1 flex cursor-pointer items-center gap-2 text-xs text-muted">
              <Checkbox checked={internal} onChange={setInternal} label="Internal work" size={15} />
              Internal work — the client never receives this
            </label>
          </div>

          <label className="col-span-2 flex flex-col gap-1.5 text-xs text-muted">
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

          {state.error && <p className="col-span-2 text-xs text-red-300">{state.error}</p>}

          <div className="col-span-2 mt-1 flex justify-end gap-2">
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
