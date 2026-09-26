import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { assignOptionsFor, getAllUsers } from "@/lib/users";
import { ACTIVE_STATUSES, type Role, type TaskStatus } from "@/lib/workflow";
import { PUBLIC_USER_SELECT } from "@/lib/publicUser";
import { TaskRow } from "../../TaskRow";
import { NewTaskRow } from "../../NewTaskRow";
import { ProjectHeader } from "../ProjectHeader";
import { clientHref } from "@/lib/slug";
import { ProjectFiles } from "../ProjectFiles";
import { InvoicePicker } from "../InvoicePicker";
import { clientBatches, newBatchKey } from "@/lib/invoiceBatches";

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
      // newest first, for the task form's "latest few" project list
      client: { include: { projects: { orderBy: { createdAt: "desc" } } } },
      assets: { orderBy: { sortOrder: "asc" } },
      tasks: {
        orderBy: { createdAt: "desc" },
        include: { assignedTo: { select: PUBLIC_USER_SELECT }, tags: true, project: { include: { client: true } } },
      },
    },
  });
  if (!project) notFound();

  const editors = assignOptionsFor(me, users);
  const boardProjects = project.client.projects.map((p) => ({
    id: p.id,
    name: p.name || p.type,
    client: { id: project.client.id, name: project.client.name },
  }));

  // which invoice it's billed in (finished work, on a client with a rule),
  // and the others it could move to — ops only, like the rule itself
  const rule = {
    cadence: project.client.billingCadence,
    dayOfMonth: project.client.billingDayOfMonth,
    every: project.client.billingMilestoneCount,
  };
  const batches = clientBatches(
    project.client.projects,
    rule,
    new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Kolkata" })
  );
  const inBatch = batches.find((b) => b.ids.includes(project.id));
  const nextKey = newBatchKey(batches, rule);
  const invoiceOptions = [
    ...(nextKey ? [{ value: nextKey, label: "New invoice" }] : []),
    ...batches.map((b) => ({ value: b.key, label: b.label })),
  ];

  const active = project.tasks.filter((t) => ACTIVE_STATUSES.includes(t.status as TaskStatus));
  const done = project.tasks.filter((t) => !ACTIVE_STATUSES.includes(t.status as TaskStatus));

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href={clientHref(project.client)}
        className="mb-6 flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft size={14} /> {project.client.name}
      </Link>

      <ProjectHeader
        projectId={project.id}
        clientId={project.clientId}
        clientHref={clientHref(project.client)}
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
        invoice={
          inBatch && me.role !== "employee" ? (
            <InvoicePicker key={inBatch.key} projectId={project.id} value={inBatch.key} options={invoiceOptions} />
          ) : undefined
        }
      />

      <section className="mt-12">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-sm font-medium">Tasks</h2>
          {active.length > 0 && <span className="text-xs text-muted">{active.length} in flight</span>}
        </div>
        {/* Only what's still being worked on. A delivered task is a finished
            file, so it's listed under Files, below, as one. */}
        {active.length === 0 && (
          <p className="mb-3 text-sm text-muted">
            Nothing in flight{done.length > 0 ? ` — ${done.length} delivered, under Files` : ""}.
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {active.map((t) => (
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
            <NewTaskRow projects={boardProjects} editors={editors} defaultProjectId={project.id} canCreateProject={me?.role !== "employee"} />
          </li>
        </ul>
      </section>

      <ProjectFiles
        projectId={project.id}
        assets={project.assets.map((a) => ({ id: a.id, name: a.name, contentType: a.contentType, link: a.link }))}
        delivered={done
          .filter((t) => t.status === "delivered_and_uploaded")
          .map((t) => ({ id: t.id, title: t.title, link: t.driveLink, at: t.updatedAt.toISOString() }))}
      />
    </div>
  );
}
