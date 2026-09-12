"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Pencil, Trash2 } from "lucide-react";
import { updateProject, deleteProject } from "../clients/actions";

// Cover left, the few facts that matter right. Editing swaps the right-hand
// column in place rather than opening a dialog — it's three fields.
export function ProjectHeader({
  projectId,
  name,
  status,
  coverUrl,
  driveLink,
  completedAt,
  canDelete,
}: {
  projectId: string;
  name: string;
  status: string;
  coverUrl: string | null;
  driveLink: string | null;
  completedAt: string | null;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deleteRef = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState({ name, status, driveLink: driveLink ?? "" });

  async function save() {
    setSaving(true);
    setError(null);
    const res = await updateProject(projectId, form);
    setSaving(false);
    if (res.error) return setError(res.error);
    setEditing(false);
    router.refresh();
  }

  async function confirmDelete() {
    const res = await deleteProject(projectId);
    if (res.error) {
      setError(res.error);
      deleteRef.current?.close();
      return;
    }
    router.push("/tasks/clients");
  }

  const done = status === "completed";

  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
      <div className="aspect-video w-full shrink-0 overflow-hidden rounded-2xl bg-surface-2 sm:w-72">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a local file under public/, already downscaled
          <img src={coverUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted">No cover</div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {editing ? (
          <>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
            />
            <select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
            >
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
            </select>
            <input
              placeholder="Drive folder link"
              value={form.driveLink}
              onChange={(e) => setForm((f) => ({ ...f, driveLink: e.target.value }))}
              className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
            />
            {error && <p className="text-xs text-red-300">{error}</p>}
            <div className="flex items-center justify-between">
              {canDelete && (
                <button
                  onClick={() => deleteRef.current?.showModal()}
                  className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
                >
                  <Trash2 size={13} /> Delete
                </button>
              )}
              <div className="ml-auto flex gap-2">
                <button onClick={() => setEditing(false)} className="btn-ghost rounded-md px-3 py-1.5 text-xs">
                  Cancel
                </button>
                <button onClick={save} disabled={saving} className="btn-glow rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-60">
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <h1 className="min-w-0 flex-1 text-2xl font-semibold tracking-tight">{name}</h1>
              <button onClick={() => setEditing(true)} className="btn-ghost mt-1 flex items-center gap-1 rounded-md px-2 py-1 text-xs">
                <Pencil size={12} /> Edit
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                  done
                    ? "border-green-400/30 bg-green-400/15 text-green-300"
                    : "border-blue-400/30 bg-blue-400/15 text-blue-300"
                }`}
              >
                {done ? "Completed" : "In progress"}
              </span>
              {completedAt && <span className="text-xs text-muted">{completedAt}</span>}
            </div>
            {driveLink && (
              <a
                href={driveLink}
                target="_blank"
                rel="noreferrer"
                className="flex w-fit items-center gap-1.5 text-sm text-muted hover:text-foreground"
              >
                Drive folder <ExternalLink size={13} />
              </a>
            )}
            {error && <p className="text-xs text-red-300">{error}</p>}
          </>
        )}
      </div>

      <dialog
        ref={deleteRef}
        className="glass fixed top-1/2 left-1/2 m-0 w-80 -translate-x-1/2 -translate-y-1/2 rounded-xl p-4 text-foreground"
      >
        <p className="text-sm">
          Delete <strong>{name}</strong>? Its file links go with it — this can&apos;t be undone.
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={() => deleteRef.current?.close()} className="btn-ghost rounded-md px-3 py-1 text-xs">
            Cancel
          </button>
          <button
            onClick={confirmDelete}
            className="rounded-md border border-red-500/30 bg-red-500/15 px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-500/25"
          >
            Delete
          </button>
        </div>
      </dialog>
    </div>
  );
}
