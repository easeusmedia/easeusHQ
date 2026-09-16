import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { assignableEditors, getAllUsers } from "@/lib/users";
import { ACTIVE_STATUSES, type Role, type TaskStatus } from "@/lib/workflow";
import { PUBLIC_USER_SELECT } from "@/lib/publicUser";
import { TaskRow } from "../../TaskRow";
import { NewTaskRow } from "../../NewTaskRow";
import { ProjectHeader } from "../ProjectHeader";
import { ProjectFiles } from "../ProjectFiles";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) redirect("/login");

  const users = await getAllUsers();
  const me = users.find((u) => u.id === sessionUserId);
  if (!me) redirect("/login");
  // Open to the whole team: everyone should be able to see what's
  // happening for a client, whatever their role. Billing stays admin-only
  // (see the canSeeBilling tab below) — that's the one part of a client
  // that isn't everybody's business.

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      client: { include: { projects: true } },
      assets: { orderBy: { sortOrder: "asc" } },
      tasks: {
        orderBy: { createdAt: "desc" },
        include: { assignedTo: { select: PUBLIC_USER_SELECT }, tags: true, project: { include: { client: true } } },
      },
    },
  });
  if (!project) notFound();

  const editors = assignableEditors(users);
  const boardProjects = project.client.projects.map((p) => ({
    id: p.id,
    name: p.name || p.type,
    client: { id: project.client.id, name: project.client.name },
  }));

  const active = project.tasks.filter((t) => ACTIVE_STATUSES.includes(t.status as TaskStatus));
  const done = project.tasks.filter((t) => !ACTIVE_STATUSES.includes(t.status as TaskStatus));

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href={`/clients/${project.clientId}`}
        className="mb-6 flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft size={14} /> {project.client.name}
      </Link>

      <ProjectHeader
        projectId={project.id}
        clientId={project.clientId}
        name={project.name || project.type}
        status={project.status}
        coverUrl={project.coverUrl}
        driveLink={project.driveLink}
        type={project.type}
        completedAt={
          project.completedAt
            ? project.completedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
            : null
        }
        completedOn={project.completedAt ? project.completedAt.toISOString().slice(0, 10) : ""}
        canDelete={project.tasks.length === 0}
      />

      <section className="mt-12">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-sm font-medium">Tasks</h2>
          {project.tasks.length > 0 && (
            <span className="text-xs text-muted">
              {active.length} in flight · {done.length} delivered
            </span>
          )}
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
          {/* every task made here is pre-scoped to this project — no
              hunting it back out of a list of every project on the board */}
          <li>
            <NewTaskRow projects={boardProjects} editors={editors} defaultProjectId={project.id} />
          </li>
        </ul>
      </section>

      <ProjectFiles
        projectId={project.id}
        assets={project.assets.map((a) => ({ id: a.id, name: a.name, contentType: a.contentType, link: a.link }))}
      />
    </div>
  );
}
