"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Trash2 } from "lucide-react";
import { deleteProject } from "./actions";

export type ProjectCardData = {
  id: string;
  name: string;
  status: string;
  coverUrl: string | null;
  completedAt: string | null;
  // ISO yyyy-mm-dd (completedAt if it has one, else createdAt) — sortable
  // and directly comparable to a date-input's own value, unlike
  // completedAt above which is already formatted for display
  date: string;
  assetCount: number;
  activeTasks: number;
  // every task on it, finished ones included — what deleting would take
  taskCount?: number;
  // paid / unpaid, or null when nobody's recorded it
  invoiceStatus: string | null;
};

// the line under a project's name: what's still being made on it, else when
// it was finished, else how many files it has
function projectLine(project: ProjectCardData) {
  return project.activeTasks > 0
    ? `${project.activeTasks} active task${project.activeTasks === 1 ? "" : "s"}`
    : project.completedAt ?? `${project.assetCount} file${project.assetCount === 1 ? "" : "s"}`;
}

// The same project as one row of the list view: a small cover, the name and
// its line, and where it stands.
export function ProjectRow({ project, href = `/projects/${project.id}` }: { project: ProjectCardData; href?: string }) {
  const done = project.status === "completed";
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 px-3 py-2 transition-colors hover:bg-surface-2/60">
        <span className="aspect-video w-20 shrink-0 overflow-hidden rounded-md bg-surface-2">
          {project.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- a local file under public/, already downscaled
            <img src={project.coverUrl} alt="" className="h-full w-full object-cover" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{project.name}</span>
          <span className="block truncate text-xs text-muted">{projectLine(project)}</span>
        </span>
        <span
          className={`shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${
            done ? "border-green-400/30 bg-green-400/15 text-green-300" : "border-blue-400/30 bg-blue-400/15 text-blue-300"
          }`}
        >
          {done ? "Delivered" : "In progress"}
        </span>
      </Link>
    </li>
  );
}

// A cover, a name, and one line underneath. Clicking opens the project,
// where everything it produced actually lives — except the delete button
// in the corner, which skips that trip entirely.
export function ProjectCard({
  project,
  href = `/projects/${project.id}`,
  readOnly = false,
}: {
  project: ProjectCardData;
  href?: string;
  // the client's own page: no delete
  readOnly?: boolean;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // a project's tasks go with it, so that one asks twice: the first Delete
  // arms it and spells out what's about to happen, the second does it
  const [armed, setArmed] = useState(false);
  const tasks = project.taskCount ?? 0;
  const done = project.status === "completed";

  async function confirmDelete() {
    setDeleting(true);
    setError(null);
    const res = await deleteProject(project.id);
    setDeleting(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    dialogRef.current?.close();
    router.refresh();
  }

  return (
    <div className="group relative">
      <Link href={href} className="card-surface card-interactive flex flex-col overflow-hidden rounded-xl shadow-sm">
        <div className="relative aspect-video w-full overflow-hidden bg-surface-2">
          {project.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a local file under public/, already downscaled
            <img
              src={project.coverUrl}
              alt=""
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted">No cover</div>
          )}
          {!done && (
            <span className="absolute top-1.5 right-1.5 rounded-full border border-blue-400/30 bg-blue-400/20 px-1.5 py-0.5 text-xs font-medium text-blue-200 backdrop-blur">
              In progress
            </span>
          )}
        </div>

        <div className="flex flex-col gap-0.5 px-3 py-2.5">
          <p className="truncate text-[13px] font-medium">{project.name}</p>
          <p className="text-xs text-muted">{projectLine(project)}</p>
        </div>
      </Link>

      {!readOnly && (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault(); // sits over the Link — don't also navigate
          setArmed(false);
          setError(null);
          dialogRef.current?.showModal();
        }}
        title="Delete project"
        className="absolute bottom-2 right-2 flex h-6 w-6 items-center justify-center rounded-md text-muted opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
      >
        <Trash2 size={13} />
      </button>
      )}

      <dialog
        ref={dialogRef}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        onClose={() => setArmed(false)}
        className="glass fixed top-1/2 left-1/2 m-0 w-80 -translate-x-1/2 -translate-y-1/2 rounded-xl p-4 text-foreground"
      >
        <p className="text-sm">
          Delete <strong>{project.name}</strong>?{" "}
          {project.taskCount
            ? `Its ${project.taskCount} task${project.taskCount === 1 ? "" : "s"} — finished ones included — and its file links go with it.`
            : "Its file links go with it."}{" "}
          This can&apos;t be undone.
        </p>
        {armed && (
          <div className="fade-in mt-3 flex gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-red-300" />
            <p className="text-xs text-red-200">
              Last check: this deletes <strong>{tasks}</strong> task{tasks === 1 ? "" : "s"} along with the project, including
              everything already delivered and each task&apos;s history. There is no way to get them back.
            </p>
          </div>
        )}
        {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={() => dialogRef.current?.close()} className="btn-ghost rounded-md px-3 py-1 text-xs">
            Cancel
          </button>
          <button
            type="button"
            // with tasks on it, the first press only arms the delete
            onClick={() => (tasks > 0 && !armed ? setArmed(true) : confirmDelete())}
            disabled={deleting}
            // the count and the consequence are in the warning right above;
            // a button that spells them out again wraps to three lines and
            // stops looking like a button
            className="shrink-0 whitespace-nowrap rounded-md border border-red-500/30 bg-red-500/15 px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-500/25 disabled:opacity-60"
          >
            {deleting ? "Deleting…" : armed ? "Delete permanently" : "Delete"}
          </button>
        </div>
      </dialog>
    </div>
  );
}
