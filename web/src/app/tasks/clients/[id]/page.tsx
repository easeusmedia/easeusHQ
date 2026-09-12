import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { getAllUsers } from "@/lib/users";
import { ACTIVE_STATUSES, type Role, type TaskStatus } from "@/lib/workflow";
import { Board } from "../../Board";
import { BillingPanel } from "../BillingPanel";
import { ClientActiveTasks } from "../ClientActiveTasks";
import { ClientDeliverables } from "../ClientDeliverables";
import { ClientInfo } from "../ClientInfo";
import { ClientStats } from "../ClientStats";
import { ClientWork } from "../ClientWork";
import { StatusDropdown } from "../StatusDropdown";
import { ClientTabs } from "../ClientTabs";
import { ClientAvatar } from "../ClientAvatar";
import { ClientTags } from "../ClientTags";
import { listTags } from "../actions";

export const dynamic = "force-dynamic";

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
      projects: true,
      invoices: { orderBy: { createdAt: "desc" } },
      deliverables: { orderBy: { sortOrder: "asc" } },
      workItems: { orderBy: { completedAt: "desc" } },
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

  const unpaid = client.workItems.filter((w) => w.invoiceStatus === "unpaid").length;

  return (
    <>
      <Link href="/tasks/clients" className="mb-4 flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft size={14} /> Clients
      </Link>

      <div className="mb-5 flex items-center gap-3">
        <ClientAvatar clientId={client.id} name={client.name} avatarUrl={client.avatarUrl} />
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">{client.name}</h1>
            <StatusDropdown clientId={client.id} status={client.status} size="md" />
          </div>
          <ClientTags clientId={client.id} clientTags={client.tags} allTags={allTags} />
        </div>
      </div>

      <div className="mb-5">
        <ClientStats
          activeTasks={tasks.length}
          delivered={client.workItems.filter((w) => w.status === "completed").length}
          projects={client.projects.length}
          unpaid={unpaid}
        />
      </div>

      <ClientTabs
        tabs={[
          {
            key: "overview",
            label: "Overview",
            content: (
              <div className="flex flex-col gap-6">
                <section>
                  <h2 className="mb-2.5 text-sm font-medium">Active tasks</h2>
                  <ClientActiveTasks
                    tasks={tasks.map((t) => ({
                      id: t.id,
                      title: t.title,
                      status: t.status as TaskStatus,
                      projectType: t.project.type,
                      assignee: t.assignedTo?.name ?? null,
                    }))}
                  />
                </section>
                <ClientDeliverables clientId={client.id} deliverables={client.deliverables} />
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
                projects={client.projects.map((p) => ({ id: p.id, client: { name: client.name } }))}
                editors={editors}
                actingUserId={me.id}
                actingRole={me.role as Role}
                canCreate
              />
            ),
          },
          {
            key: "work",
            label: "Work delivered",
            count: client.workItems.length,
            content: (
              <ClientWork
                items={client.workItems.map((w) => ({
                  id: w.id,
                  title: w.title.trim(),
                  status: w.status,
                  batch: w.batch,
                  link: w.link,
                  invoiceStatus: w.invoiceStatus,
                  // formatted here so the server and client agree — a raw
                  // Date through toLocaleDateString() hydrates differently
                  completedAt: w.completedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
                }))}
              />
            ),
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
