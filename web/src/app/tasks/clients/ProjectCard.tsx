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
    <Link href={`/tasks/projects/${project.id}`} className="card-surface card-interactive group flex flex-col overflow-hidden rounded-xl shadow-sm">
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
  );
}
