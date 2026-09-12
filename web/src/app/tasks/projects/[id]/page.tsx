import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { getAllUsers } from "@/lib/users";
import { ACTIVE_STATUSES, type TaskStatus } from "@/lib/workflow";
import { STAGE } from "@/lib/stages";
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
      client: true,
      assets: { orderBy: { sortOrder: "asc" } },
      tasks: { orderBy: { createdAt: "desc" }, include: { assignedTo: true } },
    },
  });
  if (!project) notFound();

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

  const activeTasks = project.tasks.filter((t) => ACTIVE_STATUSES.includes(t.status as TaskStatus));

  return (
    <>
      <Link
        href={`/tasks/clients/${project.clientId}`}
        className="mb-5 flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
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

      {activeTasks.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-medium">Tasks in flight</h2>
          <ul className="flex flex-col gap-1.5">
            {activeTasks.map((t) => (
              <li key={t.id} className="flex items-center gap-3 rounded-xl bg-surface-2 px-4 py-3">
                <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                {t.assignedTo && <span className="shrink-0 text-xs text-muted">{t.assignedTo.name}</span>}
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${STAGE[t.status as TaskStatus].pill}`}
                >
                  {STAGE[t.status as TaskStatus].label}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium">Files</h2>
        {groups.length === 0 ? (
          <p className="text-sm text-muted">No files recorded for this project yet.</p>
        ) : (
          <div className="flex flex-col gap-6">
            {groups.map(([type, assets]) => (
              <div key={type}>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                  {type} <span className="text-muted/70">{assets.length}</span>
                </h3>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {assets.map((a) =>
                    a.link ? (
                      <a
                        key={a.id}
                        href={a.link}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface-2/40 px-4 py-3 hover:bg-surface-2"
                      >
                        <span className="min-w-0 truncate text-sm">{a.name}</span>
                        <ExternalLink size={13} className="shrink-0 text-muted" />
                      </a>
                    ) : (
                      <div
                        key={a.id}
                        className="flex items-center rounded-xl border border-border bg-surface-2/40 px-4 py-3 text-sm text-muted"
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
    </>
  );
}
