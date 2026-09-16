import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { assignableEditors, getAllUsers } from "@/lib/users";
import { ACTIVE_STATUSES, type Role } from "@/lib/workflow";
import { isAbhishekOrAdmin } from "@/lib/actingUser";
import { visibleTagWhere } from "@/lib/scope";
import { PUBLIC_USER_SELECT } from "@/lib/publicUser";
import { clientLogoSrc } from "@/lib/photos";
import { Board } from "../../Board";
import { BillingPanel } from "../BillingPanel";
import { ClientDeliverables } from "../ClientDeliverables";
import { ClientInfo } from "../ClientInfo";
import { ClientNotionLink } from "../ClientNotionLink";
import { ClientOnboarding } from "../ClientOnboarding";
import { ClientOngoing } from "../ClientOngoing";
import { ClientStats } from "../ClientStats";
import { ProjectsSection } from "../ProjectsSection";

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

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string; show?: string }>;
}) {
  const { slug } = await params;
  const { tab, show } = await searchParams;
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) redirect("/login");

  const users = await getAllUsers();
  const me = users.find((u) => u.id === sessionUserId);
  if (!me) redirect("/login");
  // Open to the whole team: everyone should be able to see what's
  // happening for a client, whatever their role. Billing stays admin-only
  // (see the canSeeBilling tab below) — that's the one part of a client
  // that isn't everybody's business.
  const canSeeBilling = isAbhishekOrAdmin(me);

  const client = await prisma.client.findUnique({
    where: { slug },
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
  const editors = assignableEditors(users);

  const [tasks, deliveredSinceInvoice, allTags, clientWorkTasks] = await Promise.all([
    prisma.task.findMany({
      where: { status: { in: ACTIVE_STATUSES }, projectId: { in: projectIds } },
      orderBy: { createdAt: "desc" },
      include: { assignedTo: { select: PUBLIC_USER_SELECT }, tags: true, project: { include: { client: true } } },
    }),
    prisma.task.count({
      where: {
        status: "delivered_and_uploaded",
        projectId: { in: projectIds },
        updatedAt: { gt: client.lastInvoicedAt ?? new Date(0) },
      },
    }),
    listTags(),
    // work tasks sitting on one of this client's projects — a different
    // system from the editing queue, and previously invisible here
    prisma.workTask.findMany({
      where: { projectId: { in: projectIds }, status: { not: "done" } },
      include: { assignedTo: { select: PUBLIC_USER_SELECT }, tags: true, project: true },
      orderBy: [{ status: "asc" }, { sortOrder: "asc" }],
    }),
  ]);
  // only this person's own team's kinds of work (plus any shared ones) —
  // Sales never has to pick past "Colour correction"
  const taskTags = await prisma.taskTag.findMany({
    where: visibleTagWhere({ id: me.id, role: me.role, email: me.email, teamId: me.teamId }),
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  // the client's work splits two ways on the Overview: what they'll receive,
  // and what's done for them behind the scenes
  const deliverableTasks = tasks.filter((t) => !t.internal);
  const internalTasks = tasks.filter((t) => t.internal);

  const boardProjects = client.projects.map((p) => ({ id: p.id, name: p.name || p.type, client: { id: client.id, name: client.name } }));
  const completed = client.projects.filter((p) => p.status === "completed");
  const live = client.projects.filter((p) => p.status !== "completed");
  const projectCards = client.projects.map((p) => ({
    id: p.id,
    name: p.name || p.type,
    status: p.status,
    coverUrl: p.coverUrl,
    completedAt: p.completedAt ? shortDate(p.completedAt) : null,
    date: (p.completedAt ?? p.createdAt).toISOString().slice(0, 10),
    assetCount: p._count.assets,
    activeTasks: p._count.tasks,
    invoiceStatus: p.invoiceStatus,
  }));

  return (
    // the left-side switcher (ClientSwitcherSlot) lives in the shared
    // layout now, as a sibling of this whole page rather than something
    // rendered from inside it — see ClientSwitcher's own comment for why
    //
    // min-h-full + flex column: the task-board tab fills the height left
    // under the tab strip and scrolls inside itself, the way the main
    // dashboard does. Every other tab just grows and lets the page scroll.
    <div className="flex min-h-full flex-col">
      <Link href="/clients" className="mb-6 flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft size={14} /> Clients
      </Link>

      <div className="mb-8 flex items-center gap-4">
        <ClientAvatar clientId={client.id} name={client.name} logo={clientLogoSrc(client)} />
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{client.name}</h1>
            <StatusDropdown clientId={client.id} status={client.status} size="md" />
          </div>
          {client.niche && <p className="text-sm text-muted">{client.niche}</p>}
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

      <ClientTabs
        initialTab={tab}
        width=""
        tabs={[
          {
            key: "overview",
            label: "Overview",
            content: (
              <div className="flex flex-col gap-10">
                <ClientOnboarding clientId={client.id} steps={client.onboarding} />

                <section>
                  <h2 className="mb-4 text-sm font-medium">Ongoing work</h2>
                  <p className="-mt-3 mb-3 text-xs text-muted">
                    What the client receives — this is what lands in their projects once delivered.
                  </p>
                  <ClientOngoing
                    tasks={deliverableTasks}
                    workTasks={clientWorkTasks.map((t) => ({
                      id: t.id,
                      title: t.title,
                      status: t.status,
                      projectName: t.project ? t.project.name || t.project.type : null,
                      assignee: t.assignedTo ? { name: t.assignedTo.name } : null,
                      tags: t.tags.map((x) => x.name),
                    }))}
                    clientName={client.name}
                    editors={editors}
                    projects={boardProjects}
                    actingUserId={me.id}
                    actingRole={me.role as Role}
                    taskTags={taskTags}
                  />
                </section>

                {/* The other half of the client's work: real work done for
                    them that never leaves the studio — audio engineering,
                    colour correction, channel management. It belongs to the
                    client and is tracked and assigned like anything else,
                    it just isn't a deliverable, so it's listed apart from
                    the work that is rather than mixed in with it. */}
                {internalTasks.length > 0 && (
                  <section>
                    <h2 className="mb-4 text-sm font-medium">Internal work</h2>
                    <p className="-mt-3 mb-3 text-xs text-muted">
                      Done for this client, never handed to them — doesn&apos;t count towards delivered projects.
                    </p>
                    <ClientOngoing
                      tasks={internalTasks}
                      clientName={client.name}
                      editors={editors}
                      projects={boardProjects}
                      actingUserId={me.id}
                      actingRole={me.role as Role}
                      taskTags={taskTags}
                    />
                  </section>
                )}


                <ProjectsSection
                  clientId={client.id}
                  projects={projectCards}
                  initialShow={show}
                  billing={{ cadence: client.billingCadence, dayOfMonth: client.billingDayOfMonth, every: client.billingMilestoneCount }}
                  // the studio's own calendar day, not the server's UTC one
                  today={new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Kolkata" })}
                />
              </div>
            ),
          },
          {
            key: "tasks",
            label: "Task board",
            count: tasks.length,
            bleed: true,
            // Exactly the dashboard's board, not a second layout for it.
            // This used to run in `flow` mode, which squeezed all seven
            // stages into the available width (columns ~85px wide, titles
            // wrapping over four lines) and added its own px-6/px-8 on top
            // of the page padding it already sat inside — the "compressed,
            // too much left-right padding" this is fixing. The wrapper
            // cancels that page padding on the sides and gives the board a
            // real height to fill, which is all the dashboard does too.
            content: (
              <div className="-mx-6 flex min-h-0 flex-1 flex-col sm:-mx-8">
                <Board
                  tasks={tasks}
                  projects={boardProjects}
                  editors={editors}
                  actingUserId={me.id}
                  actingRole={me.role as Role}
                  canCreate
                  taskTags={taskTags}
                />
              </div>
            ),
          },
          {
            key: "deliverables",
            label: "Deliverables",
            content: <ClientDeliverables clientId={client.id} deliverables={client.deliverables} />,
          },
          // Billing is money: invoice amounts, the billing rule, what's owed.
          // Every core member could open it; it's admin + Abhishek (dev)
          // only now, the same bar "viewing as" and permanent deletes use.
          ...(canSeeBilling
            ? [{
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
              }]
            : []),
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
