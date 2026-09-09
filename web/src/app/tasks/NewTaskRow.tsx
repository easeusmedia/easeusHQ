import { createTask } from "./actions";

type Project = { id: string; client: { name: string } };
type Editor = { id: string; name: string };

// native <details> gives us a collapsible "add task" affordance for free —
// no client JS, no modal component needed
export function NewTaskRow({ projects, editors }: { projects: Project[]; editors: Editor[] }) {
  return (
    <details className="rounded-lg border border-dashed border-border bg-surface/50 p-2 text-sm">
      <summary className="cursor-pointer font-medium text-foreground">+ New task</summary>
      <form action={createTask} className="mt-2 flex flex-col gap-2">
        <select name="projectId" required className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs">
          <option value="">Client…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.client.name}</option>
          ))}
        </select>
        <input
          name="title"
          placeholder="Video / subject"
          required
          className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs"
        />
        <select name="assignedToId" required className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs">
          <option value="">Assign to…</option>
          {editors.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
        <input
          name="rawLink"
          placeholder="Raw footage (Google Drive link)"
          className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs"
        />
        <textarea
          name="editingNotes"
          placeholder="Editing notes for the editor — instructions, references, anything they need…"
          rows={3}
          className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs"
        />
        <button className="btn-glow rounded-md px-3 py-2 text-xs font-medium">Add task</button>
      </form>
    </details>
  );
}
