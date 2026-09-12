import Link from "next/link";

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
// where everything it produced actually lives.
export function ProjectCard({ project }: { project: ProjectCardData }) {
  const done = project.status === "completed";
  return (
    <Link href={`/tasks/projects/${project.id}`} className="card-surface group flex flex-col overflow-hidden rounded-2xl shadow-sm">
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
          <span className="absolute top-2 right-2 rounded-full border border-blue-400/30 bg-blue-400/20 px-2 py-0.5 text-[11px] font-medium text-blue-200 backdrop-blur">
            In progress
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1 p-4">
        <p className="truncate text-sm font-medium">{project.name}</p>
        <p className="text-xs text-muted">
          {project.activeTasks > 0
            ? `${project.activeTasks} active task${project.activeTasks === 1 ? "" : "s"}`
            : project.completedAt ?? `${project.assetCount} file${project.assetCount === 1 ? "" : "s"}`}
        </p>
      </div>
    </Link>
  );
}
