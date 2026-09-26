import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { assignOptionsFor, getAllUsers } from "@/lib/users";
import { ACTIVE_STATUSES, type Role } from "@/lib/workflow";
import { isAbhishekOrAdmin } from "@/lib/actingUser";
import { seesClientFeedback, visibleTagWhere } from "@/lib/scope";
import { PUBLIC_USER_SELECT } from "@/lib/publicUser";
import { clientLogoSrc } from "@/lib/photos";
import { Board } from "../../Board";
import { BillingPanel } from "../BillingPanel";
import { ClientDeliverables } from "../ClientDeliverables";
import { ClientInfo } from "../ClientInfo";
import { ClientOnboarding } from "../ClientOnboarding";
import { ClientOngoing } from "../ClientOngoing";
import { ClientStats } from "../ClientStats";
import { ProjectsSection } from "../ProjectsSection";
import { ContentCalendar } from "../ContentCalendar";
import { ClientAnalytics } from "../ClientAnalytics";
import { apifyTokens } from "@/lib/apify";
import { socialLink } from "@/lib/analytics";
import { planFor } from "@/lib/contentPlan";
import { dueState, indiaDay } from "@/lib/due";

import { StatusDropdown } from "../StatusDropdown";
import { ClientShare } from "../ClientShare";
import { ClientMessages } from "../ClientMessages";
import { ClientTabs } from "../ClientTabs";
import { ProfileHead } from "../../ProfileHead";
import { PhotoEdit } from "../../PhotoEdit";
import { ClientTags } from "../ClientTags";
import { listTags, updateClientAvatar } from "../actions";

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
  searchParams: Promise<{ tab?: string; show?: string; layout?: string }>;
}) {
  const { slug } = await params;
  const { tab, show, layout } = await searchParams;
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
      documents: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      tags: true,
    },
  });
  if (!client) notFound();

  // client messages: admin/Abhishek and Operations' core members only
  const opsTeam = await prisma.team.findUnique({ where: { slug: "operations" }, select: { id: true } });
  const canSeeFeedback = seesClientFeedback(me, opsTeam?.id ?? null);
  const feedback = canSeeFeedback
    ? await prisma.clientFeedback.findMany({ where: { clientId: client.id }, orderBy: { createdAt: "desc" }, take: 50 })
    : [];

  const projectIds = client.projects.map((p) => p.id);
  const editors = assignOptionsFor(me, users);

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
  // how many tasks each project carries in total (the active count above is
  // filtered) — the delete confirmation says what would go with it
  const tasksPerProject = new Map(
    (
      await prisma.task.groupBy({ by: ["projectId"], where: { projectId: { in: projectIds } }, _count: { _all: true } })
    ).map((r) => [r.projectId, r._count._all])
  );
  // every dated task of theirs, finished ones included, for the calendar
  const dated = await prisma.task.findMany({
    where: { projectId: { in: projectIds }, dueDate: { not: null } },
    select: { id: true, title: true, status: true, dueDate: true, handedOffAt: true },
  });
  const calendarItems = dated.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    due: indiaDay(t.dueDate!),
    overdue: dueState(t.dueDate, t.handedOffAt) === "overdue",
  }));
  const plan = planFor(client.contentPlan);

  // whether the Apify tokens the Analytics tab scrapes with are set up
  // (Integrations) — the same for YouTube and Instagram
  const scraping = (await apifyTokens()).length > 0;
  const canPlan = me.role !== "employee";

  const projectCards = client.projects.map((p) => ({
    id: p.id,
    name: p.name || p.type,
    status: p.status,
    coverUrl: p.coverUrl,
    completedAt: p.completedAt ? shortDate(p.completedAt) : null,
    date: (p.completedAt ?? p.createdAt).toISOString().slice(0, 10),
    assetCount: p._count.assets,
    activeTasks: p._count.tasks,
    taskCount: tasksPerProject.get(p.id) ?? 0,
    invoiceStatus: p.invoiceStatus,
    invoiceBatch: p.invoiceBatch,
  }));

  return (
    // the left-side switcher (ClientSwitcherSlot) lives in the shared
    // layout now, as a sibling of this whole page rather than something
    // rendered from inside it — see ClientSwitcher's own comment for why
    //
    // Every tab, the task board included, just grows and lets the page
    // scroll; the board keeps its stage headers pinned while it does.
    <div className="flex min-h-full flex-col">
      <Link href="/clients" className="mb-6 flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft size={14} /> Clients
      </Link>

      <div className="mb-8 flex flex-wrap items-start gap-4">
        <ProfileHead photo={<PhotoEdit name={client.name} src={clientLogoSrc(client)} size="fill" save={updateClientAvatar.bind(null, client.id)} />}>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{client.name}</h1>
              <StatusDropdown clientId={client.id} status={client.status} size="md" />
            </div>
            {client.niche && <p className="text-sm text-muted">{client.niche}</p>}
            <ClientTags clientId={client.id} clientTags={client.tags} allTags={allTags} />
          </div>
        </ProfileHead>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2 self-start">
          {/* the client's own page at this address, for the team to switch on */}
          {me.role !== "employee" && <ClientShare clientId={client.id} slug={client.slug} enabled={client.shareEnabled} />}
          {canSeeFeedback && (client.shareEnabled || feedback.length > 0) && (
            <ClientMessages
              clientId={client.id}
              items={feedback.map((f) => ({
                id: f.id,
                name: f.name,
                message: f.message,
                createdAt: f.createdAt.toISOString(),
                unread: !f.readAt,
              }))}
            />
          )}
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
                      dueDate: t.dueDate,
                    }))}
                    clientName={client.name}
                    editors={editors}
                    projects={boardProjects}
                    actingUserId={me.id}
                    actingRole={me.role as Role}
                    taskTags={taskTags}
                  />
                </section>

                {/* the plan, by day — right under what's in hand now */}
                <ContentCalendar
                  items={calendarItems}
                  today={new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Kolkata" })}
                  clientId={canPlan ? client.id : undefined}
                  plan={plan}
                  dialog={{
                    tasks,
                    clientName: client.name,
                    editors,
                    projects: boardProjects,
                    actingUserId: me.id,
                    actingRole: me.role as Role,
                    taskTags,
                  }}
                />

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
                  initialLayout={layout}
                  billing={{ cadence: client.billingCadence, dayOfMonth: client.billingDayOfMonth, every: client.billingMilestoneCount }}
                  canMoveInvoices={me.role !== "employee"}
                  plan={plan}
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
            // Exactly the dashboard's board, not a second layout for it: the
            // page scrolls, the stage headers stay pinned, and wide boards
            // scroll sideways (see StickyColumns).
            content: (
              <div className="flex min-h-0 flex-1 flex-col">
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
          {
            key: "analytics",
            label: "Analytics",
            content: (
              <ClientAnalytics
                clientId={client.id}
                accounts={{
                  youtube: client.youtubeChannel ?? socialLink(client.socialLinks, "youtube.com"),
                  instagram: client.instagramHandle ?? socialLink(client.socialLinks, "instagram.com"),
                }}
                ready={{ youtube: scraping, instagram: scraping }}
                canEdit={me.role !== "employee"}
                today={new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Kolkata" })}
              />
            ),
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
                  custom={client.documents.map((d) => ({ id: d.id, title: d.title, content: d.content }))}
                  docs={{
                    brandGuidelines: client.brandGuidelines,
                    sop: client.sop,
                    qualityChecklist: client.qualityChecklist,
                    meetingNotes: client.meetingNotes,
                    resources: client.resources,
                  }}
                />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
