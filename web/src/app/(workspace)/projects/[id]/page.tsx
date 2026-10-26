import { PrefetchLink as Link } from "@/app/(workspace)/PrefetchLink";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { isFounder, isLead, runsClients, setsUp } from "@/lib/scope";
import { getViewer } from "@/lib/viewer";
import { deliveredAt } from "@/lib/delivered";
import { indiaDay } from "@/lib/due";
import { getSessionUserId } from "@/lib/auth";
import { getAllUsers } from "@/lib/users";
import { ACTIVE_STATUSES, type TaskStatus } from "@/lib/workflow";
import { ProjectHeader } from "../ProjectHeader";
import { clientHref } from "@/lib/slug";
import { ProjectFiles } from "../ProjectFiles";
import { stageLabel } from "@/lib/stages";
import { InvoicePicker } from "../InvoicePicker";
import { ActiveClient } from "../../clients/ActiveClient";
import { clientBatches, newBatchKey } from "@/lib/invoiceBatches";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // one round: none of these needs another's answer
  const [sessionUserId, viewer, users, project, typeCounts, allTags, production] = await Promise.all([
    getSessionUserId(),
    getViewer(),
    getAllUsers(),
    prisma.project.findUnique({
      where: { id },
      include: {
        // newest first, for the task form's "latest few" project list
        client: { include: { projects: { orderBy: { createdAt: "desc" } } } },
        assets: { orderBy: { sortOrder: "asc" }, include: { tags: { select: { id: true, name: true } }, task: { select: { id: true, title: true, originalTitle: true, status: true, workflow: true, frameioLink: true, postDate: true, assignedToId: true, assignedTo: { select: { name: true } } } } } },
        tasks: {
          orderBy: { createdAt: "desc" },
          include: { tags: true },
        },
      },
    }),
    // every type in use, most common first, for the header's Type picker
    prisma.project.groupBy({ by: ["type"], _count: { type: true }, orderBy: { _count: { type: "desc" } } }),
    prisma.taskTag.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, team: { select: { slug: true } } } }),
    prisma.team.findUnique({ where: { slug: "production" }, select: { id: true } }),
  ]);
  if (!sessionUserId) redirect("/login");
  const me = users.find((u) => u.id === sessionUserId);
  if (!me || !viewer) redirect("/login");
  if (!project) notFound();
  // a Lead never sees a Founder's work (lib/scope)
  if (isLead(viewer)) {
    const founders = new Set(users.filter((u) => isFounder(u)).map((u) => u.id));
    project.tasks = project.tasks.filter((t) => !t.assignedToId || !founders.has(t.assignedToId));
    // nor which of a Founder's tasks fills a placeholder
    for (const a of project.assets) if (a.task?.assignedToId && founders.has(a.task.assignedToId)) a.task = null;
  }
  // an editor sees a client through its own page only (their work and its
  // documents), which also decides whether they may see it at all
  if (me.role === "employee") redirect(`/clients/${project.client.slug}`);

  // which invoice it's billed in — on any project, finished or not, with or
  // without a billing rule — and the others it could go in. Ops only.
  const rule = {
    cadence: project.client.billingCadence,
    dayOfMonth: project.client.billingDayOfMonth,
    every: project.client.billingMilestoneCount,
  };
  const names = (project.client.invoiceNames ?? {}) as Record<string, string>;
  const batches = clientBatches(
    project.client.projects,
    rule,
    new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Kolkata" })
  ).map((b) => (names[b.key] ? { ...b, label: rule.cadence === "monthly_date" ? names[b.key] : `${b.label} · ${names[b.key]}` } : b));
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
  // a delivered task that fills a placeholder is shown as that placeholder,
  // not a second time (lib/deliverableLink). A project laid out in
  // placeholders shows those and nothing else: work the team made for
  // itself (a reel cover, a round of amends) isn't a deliverable (Abhishek,
  // 27 Oct 2026). One with no placeholders still shows what it delivered.
  const linked = new Set(project.assets.map((a) => a.taskId).filter(Boolean));
  const deliveredFiles = project.assets.length ? [] : done.filter((t) => t.status === "delivered_and_uploaded" && !linked.has(t.id));
  // when each was really delivered, and whether this person plans postings;
  // the placeholders' delivered tasks too, for their details
  const filled = project.assets.flatMap((a) => (a.task?.status === "delivered_and_uploaded" ? [a.task.id] : []));
  const delivered = await deliveredAt([...deliveredFiles.map((t) => t.id), ...filled]);

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


      <ProjectFiles
        projectId={project.id}
        assets={project.assets.map((a) => ({
          id: a.id,
          name: a.name,
          contentType: a.contentType,
          link: a.link,
          tags: a.tags,
          dueDate: a.dueDate?.toISOString().slice(0, 10) ?? null,
          task: a.task ? { id: a.task.id, title: a.task.title, delivered: a.task.status === "delivered_and_uploaded", post: a.task.postDate ? indiaDay(a.task.postDate) : null, stage: stageLabel(a.task.status, a.task.workflow), review: a.task.frameioLink, original: a.task.originalTitle, by: a.task.assignedTo?.name ?? null, deliveredOn: delivered.get(a.task.id) ? indiaDay(delivered.get(a.task.id)!) : null } : null,
        }))}
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
        // a file is Production's work: only Production's kinds of work
        tagOptions={allTags.filter((t) => t.team?.slug === "production").map((t) => ({ id: t.id, name: t.name }))}
        // and a new one added there lands in Production (lib/scope setsUp)
        tagTeamId={setsUp(viewer) ? production?.id : undefined}
      />
    </div>
  );
}
