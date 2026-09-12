import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { getAllUsers } from "@/lib/users";
import { ACTIVE_STATUSES, type Role, type TaskStatus } from "@/lib/workflow";
import { TaskRow } from "../../TaskRow";
import { ProjectHeader } from "../ProjectHeader";

export const dynamic = "force-dynamic";

// The order the team actually thinks about a podcast episode in: the cut
// first, then the trailer, then the clips, then everything around them.
const TYPE_ORDER = ["YouTube Long-Form", "Reel Trailer", "Reel", "Bonus Reel", "Thumbnails", "Misc."];

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) redirect("/login");

  const users = await getAllUsers();
  const me = users.find((u) => u.id === sessionUserId);
  if (!me) redirect("/login");
  if (me.role === "employee") redirect("/tasks"); // admin/core only

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      client: { include: { projects: true } },
      assets: { orderBy: { sortOrder: "asc" } },
      tasks: {
        orderBy: { createdAt: "desc" },
        include: { assignedTo: true, project: { include: { client: true } } },
      },
    },
  });
  if (!project) notFound();

  const editors = users.filter((u) => u.role === "employee");
  const boardProjects = project.client.projects.map((p) => ({ id: p.id, client: { name: p.name || p.type } }));

  const groups = Object.entries(
    project.assets.reduce<Record<string, typeof project.assets>>((acc, a) => {
      (acc[a.contentType] ??= []).push(a);
      return acc;
    }, {})
  ).sort(([a], [b]) => {
    const ia = TYPE_ORDER.indexOf(a);
    const ib = TYPE_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  const active = project.tasks.filter((t) => ACTIVE_STATUSES.includes(t.status as TaskStatus));
  const done = project.tasks.filter((t) => !ACTIVE_STATUSES.includes(t.status as TaskStatus));

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href={`/tasks/clients/${project.clientId}`}
        className="mb-6 flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft size={14} /> {project.client.name}
      </Link>

      <ProjectHeader
        projectId={project.id}
        name={project.name || project.type}
        status={project.status}
        coverUrl={project.coverUrl}
        driveLink={project.driveLink}
        completedAt={
          project.completedAt
            ? project.completedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
            : null
        }
        canDelete={project.tasks.length === 0}
      />

      {project.tasks.length > 0 && (
        <section className="mt-12">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-sm font-medium">Tasks</h2>
            <span className="text-xs text-muted">
              {active.length} in flight · {done.length} delivered
            </span>
          </div>
          <ul className="flex flex-col gap-2">
            {[...active, ...done].map((t) => (
              <li key={t.id}>
                <TaskRow
                  task={t}
                  clientName={project.client.name}
                  subtitle={t.assignedTo?.name ?? "Unassigned"}
                  editors={editors}
                  projects={boardProjects}
                  actingUserId={me.id}
                  actingRole={me.role as Role}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-12">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-sm font-medium">Files</h2>
          {project.assets.length > 0 && <span className="text-xs text-muted">{project.assets.length} total</span>}
        </div>

        {groups.length === 0 ? (
          <p className="text-sm text-muted">No files recorded for this project yet.</p>
        ) : (
          <div className="flex flex-col gap-8">
            {groups.map(([type, assets]) => (
              <div key={type}>
                <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">
                  {type} <span className="text-muted/60">{assets.length}</span>
                </h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {assets.map((a) =>
                    a.link ? (
                      <a
                        key={a.id}
                        href={a.link}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-surface-2/40 px-4 py-3 hover:bg-surface-2"
                      >
                        <span className="min-w-0 truncate text-sm">{a.name}</span>
                        <ExternalLink size={13} className="shrink-0 text-muted" />
                      </a>
                    ) : (
                      <div
                        key={a.id}
                        className="flex items-center rounded-xl border border-border/60 bg-surface-2/40 px-4 py-3 text-sm text-muted"
                      >
                        {a.name}
                      </div>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
