import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { effectiveRole, isFounder, isLead, runsClients } from "@/lib/scope";
import { getViewer } from "@/lib/viewer";
import { deliveredAt } from "@/lib/delivered";
import { indiaDay } from "@/lib/due";
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
import { ActiveClient } from "../../clients/ActiveClient";
import { clientBatches, newBatchKey } from "@/lib/invoiceBatches";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // one round: none of these needs another's answer
  const [sessionUserId, viewer, users, project, typeCounts, allTags] = await Promise.all([
    getSessionUserId(),
    getViewer(),
    getAllUsers(),
    prisma.project.findUnique({
      where: { id },
      include: {
        // newest first, for the task form's "latest few" project list
        client: { include: { projects: { orderBy: { createdAt: "desc" } } } },
        assets: { orderBy: { sortOrder: "asc" }, include: { tags: { select: { id: true, name: true } } } },
        tasks: {
          orderBy: { createdAt: "desc" },
          include: { assignedTo: { select: PUBLIC_USER_SELECT }, tags: true, project: { include: { client: true } } },
        },
      },
    }),
    // every type in use, most common first, for the header's Type picker
    prisma.project.groupBy({ by: ["type"], _count: { type: true }, orderBy: { _count: { type: "desc" } } }),
    prisma.taskTag.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, teamId: true } }),
  ]);
  if (!sessionUserId) redirect("/login");
  const me = users.find((u) => u.id === sessionUserId);
  if (!me || !viewer) redirect("/login");
  if (!project) notFound();
  // a Lead never sees a Founder's work (lib/scope)
  if (isLead(viewer)) {
    const founders = new Set(users.filter((u) => isFounder(u)).map((u) => u.id));
    project.tasks = project.tasks.filter((t) => !t.assignedToId || !founders.has(t.assignedToId));
  }
  // an editor sees a client through its own page only (their work and its
  // documents), which also decides whether they may see it at all
  if (me.role === "employee") redirect(`/clients/${project.client.slug}`);

  const editors = assignOptionsFor(viewer, users);
  const boardProjects = project.client.projects.map((p) => ({
    id: p.id,
    name: p.name || p.type,
    client: { id: project.client.id, name: project.client.name },
  }));

  // which invoice it's billed in — on any project, finished or not, with or
  // without a billing rule — and the others it could go in. Ops only.
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
  const monthly = rule.cadence === "monthly_date";
  const invoiceOptions = [
    { value: "none", label: "No invoice" },
    ...(nextKey && !batches.some((b) => b.key === nextKey)
      ? [{ value: nextKey, label: monthly ? "New invoice" : `Invoice ${nextKey.replace("batch-", "")} (next)` }]
      : []),
    ...batches.map((b) => ({ value: b.key, label: b.label })),
  ];

  const types = typeCounts.map((r) => r.type);

  const active = project.tasks.filter((t) => ACTIVE_STATUSES.includes(t.status as TaskStatus));
  const done = project.tasks.filter((t) => !ACTIVE_STATUSES.includes(t.status as TaskStatus));
  const deliveredFiles = done.filter((t) => t.status === "delivered_and_uploaded");
  // when each was really delivered, and whether this person plans postings
  const delivered = await deliveredAt(deliveredFiles.map((t) => t.id));

  return (
    <div>
      {/* the clients roster beside this page shows this project's client as the open one */}
      <ActiveClient slug={project.client.slug} />
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
        types={types}
        stats={{
          active: active.length,
          delivered: done.filter((t) => t.status === "delivered_and_uploaded").length,
          files: project.assets.length,
        }}
        invoice={
          <InvoicePicker
            key={inBatch?.key ?? "none"}
            projectId={project.id}
            value={inBatch?.key ?? "none"}
            options={invoiceOptions}
            numbered={!monthly}
          />
        }
      />

      <section className="mt-12">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-sm font-medium">Tasks</h2>
          {active.length > 0 && <span className="text-xs text-muted">{active.length} in progress</span>}
        </div>
        {/* Only what's still being worked on. A delivered task is a finished
            file, so it's listed under Files, below, as one. */}
        {active.length === 0 && (
          <p className="mb-3 text-sm text-muted">
            Nothing in progress{done.length > 0 ? `. ${done.length} delivered, listed under Files` : ""}.
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
                actingRole={effectiveRole(me) as Role}
              />
            </li>
          ))}
          {/* every task made here is pre-scoped to this project — no
              hunting it back out of a list of every project on the board */}
          <li>
            <NewTaskRow projects={boardProjects} editors={editors} defaultProjectId={project.id} canCreateProject />
          </li>
        </ul>
      </section>

      <ProjectFiles
        projectId={project.id}
        assets={project.assets.map((a) => ({ id: a.id, name: a.name, contentType: a.contentType, link: a.link, tags: a.tags }))}
        delivered={deliveredFiles.map((t) => ({
          id: t.id,
          title: t.title,
          link: t.driveLink,
          // the day it was marked delivered; failing that, the day it was due to reach them
          at: (delivered.get(t.id) ?? t.deliveryDate ?? t.updatedAt).toISOString(),
          post: t.postDate ? indiaDay(t.postDate) : null,
          tags: t.tags.map((g) => ({ id: g.id, name: g.name })),
        }))}
        canPost={runsClients(viewer)}
        // the kinds of work this person picks from on a task: their team's, and shared ones
        tagOptions={allTags
          .filter((t) => isFounder(viewer) || !t.teamId || viewer.departments.some((d) => d.id === t.teamId))
          .map((t) => ({ id: t.id, name: t.name }))}
      />
    </div>
  );
}
