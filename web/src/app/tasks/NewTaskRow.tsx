"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { createTask, type TaskFormState } from "./actions";
import { NotesGlyph } from "./NotesButton";
import { Dropdown } from "./Dropdown";
import { DatePicker } from "./DatePicker";

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
}: {
  projects: Project[];
  editors: Editor[];
  // pre-picks the project when this is embedded on that project's own page,
  // so adding a task there doesn't mean hunting it back out of the list
  defaultProjectId?: string;
}) {
  const [state, formAction, pending] = useActionState(createTask, initialState);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // client-first, not one flat list of every project from every client —
  // that list only reads fine for a client with one or two episodes; a
  // client with a year of them buried the other 40-odd clients under it
  const defaultProject = projects.find((p) => p.id === defaultProjectId);
  const [clientId, setClientId] = useState(defaultProject?.client.id ?? "");
  // the form posts as FormData, and DatePicker isn't a form control — it
  // keeps its value in state and writes it to a hidden input below
  const [dueDate, setDueDate] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const clients = useMemo(() => {
    const byId = new Map(projects.map((p) => [p.client.id, p.client.name]));
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [projects]);
  const projectsForClient = projects.filter((p) => p.client.id === clientId);

  // close once the task actually lands, and clear the form (and the client
  // filter, so a re-open starts fully blank) so the next open doesn't show
  // the last thing that was added
  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting the client filter is part of the same "clear the form after a successful submit" reaction as formRef.reset() just above, not a render-loop
      setClientId(defaultProject?.client.id ?? "");
      setDueDate("");
      setScheduledFor("");
      dialogRef.current?.close();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- defaultProject is derived from props that don't change while this dialog is open
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
          <label className="flex flex-col gap-1.5 text-xs text-muted">
            Client
            <Dropdown
              defaultValue={clientId}
              placeholder="Client…"
              onChange={setClientId}
              options={clients.map((c) => ({ value: c.id, label: c.name }))}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-xs text-muted">
            Project
            {/* key={clientId}: a fresh Dropdown instance per client, so
                switching clients can't leave the previous client's project
                still selected underneath a now-different options list */}
            <Dropdown
              key={clientId}
              name="projectId"
              defaultValue={clientId === defaultProject?.client.id ? defaultProjectId : undefined}
              placeholder={clientId ? "Project…" : "Pick a client first…"}
              options={projectsForClient.map((p) => ({ value: p.id, label: p.name }))}
            />
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
