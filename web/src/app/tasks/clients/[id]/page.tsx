import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { getAllUsers } from "@/lib/users";
import { ACTIVE_STATUSES, type Role } from "@/lib/workflow";
import { Board } from "../../Board";
import { AddProjectCard } from "../AddProjectCard";
import { BillingPanel } from "../BillingPanel";
import { ClientDeliverables } from "../ClientDeliverables";
import { ClientInfo } from "../ClientInfo";
import { ClientNotionLink } from "../ClientNotionLink";
import { ClientOnboarding } from "../ClientOnboarding";
import { ClientOngoing } from "../ClientOngoing";
import { ClientStats } from "../ClientStats";
import { ProjectCard } from "../ProjectCard";
import { StatusDropdown } from "../StatusDropdown";
import { ClientTabs } from "../ClientTabs";
import { ClientAvatar } from "../ClientAvatar";
import { ClientTags } from "../ClientTags";
import { listTags } from "../actions";

export const dynamic = "force-dynamic";
// the Notion import runs as a server action from this page and talks to
// Notion dozens of times — the default serverless timeout cuts it short
export const maxDuration = 60;

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
      onboarding: { orderBy: { sortOrder: "asc" } },
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

  const boardProjects = client.projects.map((p) => ({ id: p.id, client: { name: p.name || p.type } }));
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

  // everything reads in a centred column except the task board, which gets
  // the whole width (see ClientTabs' `bleed`)
  const column = "mx-auto w-full max-w-6xl";

  return (
    <div>
      <div className={column}>
        <Link href="/tasks/clients" className="mb-6 flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
          <ArrowLeft size={14} /> Clients
        </Link>

        <div className="mb-8 flex items-center gap-4">
          <ClientAvatar clientId={client.id} name={client.name} avatarUrl={client.avatarUrl} />
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{client.name}</h1>
              <StatusDropdown clientId={client.id} status={client.status} size="md" />
            </div>
            <ClientTags clientId={client.id} clientTags={client.tags} allTags={allTags} />
          </div>
        </div>

        <div className="mb-10">
          <ClientStats
            activeTasks={tasks.length}
            inProgress={live.length}
            completed={completed.length}
            unpaid={client.projects.filter((p) => p.invoiceStatus === "unpaid").length}
          />
        </div>
      </div>

      <ClientTabs
        width={column}
        tabs={[
          {
            key: "overview",
            label: "Overview",
            content: (
              <div className="flex flex-col gap-10">
                <ClientOnboarding clientId={client.id} steps={client.onboarding} />

                <section>
                  <h2 className="mb-4 text-sm font-medium">Ongoing work</h2>
                  <ClientOngoing
                    tasks={tasks}
                    clientName={client.name}
                    editors={editors}
                    projects={boardProjects}
                    actingUserId={me.id}
                    actingRole={me.role as Role}
                  />
                </section>

                <section>
                  <div className="mb-4 flex items-baseline justify-between">
                    <h2 className="text-sm font-medium">Projects</h2>
                    <span className="text-xs text-muted">
                      {completed.length} done · {live.length} in progress
                    </span>
                  </div>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
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
            bleed: true,
            content: (
              <Board
                tasks={tasks}
                projects={boardProjects}
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
              <div className="flex flex-col gap-3">
                <ClientInfo
                  clientId={client.id}
                  name={client.name}
                  niche={client.niche}
                  contact={client.contact}
                  email={client.email}
                  whatsapp={client.whatsapp}
                  address={client.address}
                  notes={client.notes}
                  docs={{
                    brandGuidelines: client.brandGuidelines,
                    sop: client.sop,
                    qualityChecklist: client.qualityChecklist,
                    meetingNotes: client.meetingNotes,
                    resources: client.resources,
                  }}
                />
                <ClientNotionLink clientId={client.id} contentDbId={client.notionContentDbId} />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
