import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { getAllUsers } from "@/lib/users";
import { ACTIVE_STATUSES, type Role, type TaskStatus } from "@/lib/workflow";
import { Board } from "../../Board";
import { AddProjectCard } from "../AddProjectCard";
import { BillingPanel } from "../BillingPanel";
import { ClientDeliverables } from "../ClientDeliverables";
import { ClientInfo } from "../ClientInfo";
import { ClientOngoing } from "../ClientOngoing";
import { ClientStats } from "../ClientStats";
import { ProjectCard } from "../ProjectCard";
import { StatusDropdown } from "../StatusDropdown";
import { ClientTabs } from "../ClientTabs";
import { ClientAvatar } from "../ClientAvatar";
import { ClientTags } from "../ClientTags";
import { listTags } from "../actions";

export const dynamic = "force-dynamic";

const shortDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) redirect("/login");

  const users = await getAllUsers();
  const me = users.find((u) => u.id === sessionUserId);
  if (!me) redirect("/login");
  if (me.role === "employee") redirect("/tasks"); // admin/core only

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      projects: {
        orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
        include: {
          _count: { select: { assets: true, tasks: { where: { status: { in: ACTIVE_STATUSES } } } } },
        },
      },
      invoices: { orderBy: { createdAt: "desc" } },
      deliverables: { orderBy: { sortOrder: "asc" } },
      tags: true,
    },
  });
  if (!client) notFound();

  const projectIds = client.projects.map((p) => p.id);
  const editors = users.filter((u) => u.role === "employee");

  const [tasks, deliveredSinceInvoice, allTags] = await Promise.all([
    prisma.task.findMany({
      where: { status: { in: ACTIVE_STATUSES }, projectId: { in: projectIds } },
      orderBy: { createdAt: "desc" },
      include: { assignedTo: true, project: { include: { client: true } } },
    }),
    prisma.task.count({
      where: {
        status: "delivered_and_uploaded",
        projectId: { in: projectIds },
        updatedAt: { gt: client.lastInvoicedAt ?? new Date(0) },
      },
    }),
    listTags(),
  ]);

  const completed = client.projects.filter((p) => p.status === "completed");
  const live = client.projects.filter((p) => p.status !== "completed");
  const projectCards = client.projects.map((p) => ({
    id: p.id,
    name: p.name || p.type,
    status: p.status,
    coverUrl: p.coverUrl,
    completedAt: p.completedAt ? shortDate(p.completedAt) : null,
    assetCount: p._count.assets,
    activeTasks: p._count.tasks,
  }));

  return (
    <>
      <Link href="/tasks/clients" className="mb-5 flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft size={14} /> Clients
      </Link>

      <div className="mb-6 flex items-center gap-4">
        <ClientAvatar clientId={client.id} name={client.name} avatarUrl={client.avatarUrl} />
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{client.name}</h1>
            <StatusDropdown clientId={client.id} status={client.status} size="md" />
          </div>
          <ClientTags clientId={client.id} clientTags={client.tags} allTags={allTags} />
        </div>
      </div>

      <div className="mb-6">
        <ClientStats
          activeTasks={tasks.length}
          inProgress={live.length}
          completed={completed.length}
          unpaid={client.projects.filter((p) => p.invoiceStatus === "unpaid").length}
        />
      </div>

      <ClientTabs
        tabs={[
          {
            key: "overview",
            label: "Overview",
            content: (
              <div className="flex flex-col gap-10">
                <section>
                  <h2 className="mb-3 text-sm font-medium">Ongoing work</h2>
                  <ClientOngoing
                    tasks={tasks.map((t) => ({
                      id: t.id,
                      title: t.title,
                      status: t.status as TaskStatus,
                      projectName: t.project.name || t.project.type,
                      assignee: t.assignedTo?.name ?? null,
                    }))}
                  />
                </section>

                <section>
                  <div className="mb-3 flex items-baseline justify-between">
                    <h2 className="text-sm font-medium">Projects</h2>
                    <span className="text-xs text-muted">
                      {completed.length} done · {live.length} in progress
                    </span>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    <AddProjectCard clientId={client.id} />
                    {projectCards.map((p) => (
                      <ProjectCard key={p.id} project={p} />
                    ))}
                  </div>
                </section>
              </div>
            ),
          },
          {
            key: "tasks",
            label: "Task board",
            count: tasks.length,
            content: (
              <Board
                tasks={tasks}
                projects={client.projects.map((p) => ({ id: p.id, client: { name: p.name || p.type } }))}
                editors={editors}
                actingUserId={me.id}
                actingRole={me.role as Role}
                canCreate
              />
            ),
          },
          {
            key: "deliverables",
            label: "Deliverables",
            content: <ClientDeliverables clientId={client.id} deliverables={client.deliverables} />,
          },
          {
            key: "billing",
            label: "Billing",
            content: (
              <BillingPanel
                clientId={client.id}
                cadence={client.billingCadence}
                dayOfMonth={client.billingDayOfMonth}
                milestoneCount={client.billingMilestoneCount}
                deliveredSinceInvoice={deliveredSinceInvoice}
                invoices={client.invoices.map((inv) => ({ ...inv, amount: inv.amount.toString() }))}
              />
            ),
          },
          {
            key: "info",
            label: "Client info",
            content: (
              <ClientInfo
                clientId={client.id}
                name={client.name}
                niche={client.niche}
                contact={client.contact}
                notes={client.notes}
                docs={{
                  brandGuidelines: client.brandGuidelines,
                  sop: client.sop,
                  qualityChecklist: client.qualityChecklist,
                  resources: client.resources,
                }}
              />
            ),
          },
        ]}
      />
    </>
  );
}
