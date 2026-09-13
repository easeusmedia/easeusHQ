"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteProject } from "./actions";

export type ProjectCardData = {
  id: string;
  name: string;
  status: string;
  coverUrl: string | null;
  completedAt: string | null;
  assetCount: number;
  activeTasks: number;
};

// A cover, a name, and one line underneath. Clicking opens the project,
// where everything it produced actually lives — except the delete button
// in the corner, which skips that trip entirely.
export function ProjectCard({ project }: { project: ProjectCardData }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      <Link href={`/tasks/projects/${project.id}`} className="card-surface card-interactive flex flex-col overflow-hidden rounded-xl shadow-sm">
        <div className="relative aspect-video w-full overflow-hidden bg-surface-2">
          {project.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a local file under public/, already downscaled
            <img
              src={project.coverUrl}
              alt=""
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-[11px] text-muted">No cover</div>
          )}
          {!done && (
            <span className="absolute top-1.5 right-1.5 rounded-full border border-blue-400/30 bg-blue-400/20 px-1.5 py-0.5 text-[10px] font-medium text-blue-200 backdrop-blur">
              In progress
            </span>
          )}
        </div>

        <div className="flex flex-col gap-0.5 px-3 py-2.5">
          <p className="truncate text-[13px] font-medium">{project.name}</p>
          <p className="text-[11px] text-muted">
            {project.activeTasks > 0
              ? `${project.activeTasks} active task${project.activeTasks === 1 ? "" : "s"}`
              : project.completedAt ?? `${project.assetCount} file${project.assetCount === 1 ? "" : "s"}`}
          </p>
        </div>
      </Link>

      <button
        type="button"
        onClick={(e) => {
          e.preventDefault(); // sits over the Link — don't also navigate
          dialogRef.current?.showModal();
        }}
        title="Delete project"
        className="absolute bottom-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white opacity-0 backdrop-blur transition-opacity hover:bg-red-500/70 group-hover:opacity-100"
      >
        <Trash2 size={12} />
      </button>

      <dialog
        ref={dialogRef}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="glass fixed top-1/2 left-1/2 m-0 w-80 -translate-x-1/2 -translate-y-1/2 rounded-xl p-4 text-foreground"
      >
        <p className="text-sm">
          Delete <strong>{project.name}</strong>? Its file links go with it. This can&apos;t be undone.
        </p>
        {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={() => dialogRef.current?.close()} className="btn-ghost rounded-md px-3 py-1 text-xs">
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmDelete}
            disabled={deleting}
            className="rounded-md border border-red-500/30 bg-red-500/15 px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-500/25 disabled:opacity-60"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </dialog>
    </div>
  );
}
