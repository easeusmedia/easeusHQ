import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { assignOptionsFor, getAllUsers } from "@/lib/users";
import { ACTIVE_STATUSES, type Role } from "@/lib/workflow";
import { isAbhishekOrAdmin } from "@/lib/actingUser";
import { assigneeWhere, effectiveRole, runsClients, visibleTagWhere, type Viewer, seesClient, isFounder } from "@/lib/scope";
import { getViewer } from "@/lib/viewer";
import { PUBLIC_CLIENT_SELECT, PUBLIC_USER_SELECT } from "@/lib/publicUser";
import { logoSrcAt } from "@/lib/photos";
import { logoVersions } from "@/lib/pictureVersions";
import { Board } from "../../Board";
import { BillingPanel } from "../BillingPanel";
import { ClientDeliverables } from "../ClientDeliverables";
import { ClientInfo } from "../ClientInfo";
import { ClientOnboarding } from "../ClientOnboarding";
import { ClientOngoing } from "../ClientOngoing";
import { ClientStats } from "../ClientStats";
import { ProjectsSection } from "../ProjectsSection";
import { BlueprintButton } from "../Blueprint";
import { ClientAnalytics } from "../ClientAnalytics";
import { apifyTokens } from "@/lib/apify";
import { socialLink } from "@/lib/analytics";
import { planFor } from "@/lib/contentPlan";

import { StatusDropdown } from "../StatusDropdown";
import { ClientShare } from "../ClientShare";
import { ClientMessages } from "../ClientMessages";
import { ClientTabs } from "../ClientTabs";
import { ProfileHead } from "../../ProfileHead";
import { PhotoEdit } from "../../PhotoEdit";
import { ClientTags } from "../ClientTags";
import { listTags, updateClientAvatar } from "../actions";
import { ClientDocuments } from "../ClientInfo";
import { WeekCalendar, type WeekEntry } from "../WeekCalendar";
import { indiaDay } from "@/lib/due";
import { EditorAccess } from "../EditorAccess";
import { Avatar } from "../../TaskCard";

export const dynamic = "force-dynamic";
// the Notion import runs as a server action from this page and talks to
// Notion dozens of times — the default serverless timeout cuts it short
export const maxDuration = 60;

const shortDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

// A client's dated work for the week calendar: deliveries, and postings for
// Operations only (lib/scope seesPostings), from two months back to four
// ahead, whatever stage it's at (a reel goes live after it's delivered).
// Only one person's, for an editor.
async function weekEntries(projectIds: string[], { assignedToId, postings }: { assignedToId?: string; postings: boolean }): Promise<WeekEntry[]> {
  const from = new Date(Date.now() - 60 * 86_400_000);
  const to = new Date(Date.now() + 120 * 86_400_000);
  const tasks = await prisma.task.findMany({
    where: {
      projectId: { in: projectIds },
      ...(assignedToId ? { assignedToId } : {}),
      OR: [{ deliveryDate: { gte: from, lte: to } }, ...(postings ? [{ postDate: { gte: from, lte: to } }] : [])],
    },
    select: { title: true, deliveryDate: true, postDate: true },
  });
  return tasks.flatMap((t) => [
    ...(t.deliveryDate ? [{ day: indiaDay(t.deliveryDate), kind: "delivery" as const, title: t.title }] : []),
    ...(postings && t.postDate ? [{ day: indiaDay(t.postDate), kind: "posting" as const, title: t.title }] : []),
  ]);
}

// The client and everything its page shows of it
function loadClient(slug: string) {
  return prisma.client.findUnique({
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
      editors: { select: { id: true } },
      hiddenFrom: { select: { id: true } },
    },
  });
}

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string; show?: string; layout?: string }>;
}) {
  const { slug } = await params;
  const { tab, show, layout } = await searchParams;
  // Two rounds of queries rather than nine in a row: everything that needs
  // nothing else first, then everything that needs the client or you.
  const [sessionUserId, viewer, users, client, allTags, tokens] = await Promise.all([
    getSessionUserId(),
    getViewer(),
    getAllUsers(),
    loadClient(slug),
    listTags(),
    // whether the Apify tokens the Analytics tab scrapes with are set up
    // (Integrations) — the same for YouTube and Instagram
    apifyTokens(),
  ]);
  if (!sessionUserId) redirect("/login");
  const me = users.find((u) => u.id === sessionUserId);
  if (!me || !viewer) redirect("/login");
  // Open to the whole team: everyone should be able to see what's
  // happening for a client, whatever their role. Billing stays admin-only
  // (see the canSeeBilling tab below) — that's the one part of a client
  // that isn't everybody's business.
  const canSeeBilling = isAbhishekOrAdmin(me);
  if (!client || !seesClient(viewer, client)) notFound();

  // An editor sees a client only once it's been given to them, and then
  // only their own work on it and the documents they edit by (lib/scope)
  if (me.role === "employee") {
    if (!client.editors.some((e) => e.id === me.id)) notFound();
    return <EditorClientPage client={client} me={me} viewer={viewer} users={users} />;
  }

  // client messages: Founders and Client success's Leads only
  const canSeeFeedback = runsClients(viewer);
  const projectIds = client.projects.map((p) => p.id);
  const editors = assignOptionsFor(viewer, users);
  // a Lead sees the work of their departments here, never a Founder's
  const seen = assigneeWhere(viewer);

  const [feedback, tasks, deliveredSinceInvoice, clientWorkTasks, taskTags, taskCounts, week] = await Promise.all([
    canSeeFeedback
      ? prisma.clientFeedback.findMany({ where: { clientId: client.id }, orderBy: { createdAt: "desc" }, take: 50 })
      : Promise.resolve([]),
    prisma.task.findMany({
      where: { AND: [{ status: { in: ACTIVE_STATUSES }, projectId: { in: projectIds } }, seen] },
      orderBy: { createdAt: "desc" },
      include: { assignedTo: { select: PUBLIC_USER_SELECT }, tags: true, project: { include: { client: { select: PUBLIC_CLIENT_SELECT } } } },
    }),
    prisma.task.count({
      where: {
        status: "delivered_and_uploaded",
        projectId: { in: projectIds },
        updatedAt: { gt: client.lastInvoicedAt ?? new Date(0) },
      },
    }),
    // work tasks sitting on one of this client's projects — a different
    // system from the editing queue, and previously invisible here
    prisma.workTask.findMany({
      where: { AND: [{ projectId: { in: projectIds }, status: { not: "done" } }, seen] },
      include: { assignedTo: { select: PUBLIC_USER_SELECT }, tags: true, project: true },
      orderBy: [{ status: "asc" }, { sortOrder: "asc" }],
    }),
    // only this person's own team's kinds of work (plus any shared ones) —
    // Sales never has to pick past "Colour correction"
    prisma.taskTag.findMany({
      where: visibleTagWhere(viewer),
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    // how many tasks each project carries in total (the active count above
    // is filtered) — the delete confirmation says what would go with it
    prisma.task.groupBy({ by: ["projectId"], where: { projectId: { in: projectIds } }, _count: { _all: true } }),
    weekEntries(projectIds, { postings: canSeeFeedback }),
  ]);
  // the client's work splits two ways on the Overview: what they'll receive,
  // and what's done for them behind the scenes
  const deliverableTasks = tasks.filter((t) => !t.internal);
  const internalTasks = tasks.filter((t) => t.internal);

  const boardProjects = client.projects.map((p) => ({ id: p.id, name: p.name || p.type, client: { id: client.id, name: client.name } }));
  const completed = client.projects.filter((p) => p.status === "completed");
  const live = client.projects.filter((p) => p.status !== "completed");
  const tasksPerProject = new Map(taskCounts.map((r) => [r.projectId, r._count._all]));
  const plan = planFor(client.contentPlan);
  const scraping = tokens.length > 0;

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
    // Every tab, the task board included, just grows and lets the page
    // scroll; the board keeps its stage headers pinned while it does.
    <div className="flex min-h-full flex-col">
      <Link href="/clients" className="mb-6 flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft size={14} /> Clients
      </Link>

      <div className="mb-8 flex flex-wrap items-start gap-4">
        {/* a floor under the name: past it, the buttons wrap to their own
            line rather than squeezing the name away and the logo up */}
        <div className="min-w-[min(360px,100%)] flex-1">
        <ProfileHead photo={<PhotoEdit name={client.name} src={logoSrcAt(client.slug, (await logoVersions()).get(client.id))} size="fill" save={updateClientAvatar.bind(null, client.id)} />}>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{client.name}</h1>
              <StatusDropdown clientId={client.id} status={client.status} size="md" />
            </div>
            {client.niche && <p className="text-sm text-muted">{client.niche}</p>}
            <ClientTags clientId={client.id} clientTags={client.tags} allTags={allTags} />
          </div>
        </ProfileHead>
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2 self-start">
          {/* the client's own page at this address, for the team to switch on */}
          {/* which members (everyone outside the core team) can see it */}
          <EditorAccess
            clientId={client.id}
            people={users.filter((u) => (u.role === "employee" || (u.role === "core" && !isFounder(u))) && u.employment !== "former").map((u) => ({ id: u.id, name: u.name, position: u.position ?? null }))}
            given={users.filter((u) => seesClient(u, client) && !isFounder(u)).map((u) => u.id)}
          />
          <ClientShare clientId={client.id} slug={client.slug} enabled={client.shareEnabled} />
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
        // a section picked in the client sidebar arrives as a new ?tab= —
        // the tabs start afresh on it (their own clicks don't navigate)
        key={tab ?? "overview"}
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
                    Work for the client. Once delivered, it appears in their projects.
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
                    actingRole={effectiveRole(me) as Role}
                    taskTags={taskTags}
                  />
                </section>

                <WeekCalendar entries={week} today={indiaDay(new Date())} />

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
                      Work done behind the scenes for this client. It isn&apos;t delivered to them and doesn&apos;t count towards delivered projects.
                    </p>
                    <ClientOngoing
                      tasks={internalTasks}
                      clientName={client.name}
                      editors={editors}
                      projects={boardProjects}
                      actingUserId={me.id}
                      actingRole={effectiveRole(me) as Role}
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
                  canMoveInvoices
                  plan={plan}
                  // what a new project's tasks are, and when — beside Projects
                  blueprint={<BlueprintButton clientId={client.id} plan={plan} />}
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
                  actingRole={effectiveRole(me) as Role}
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
                canEdit
                today={new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Kolkata" })}
              />
            ),
          },
          // Billing is money: invoice amounts, the billing rule, what's owed.
          // Every core member could open it; it's admin + Abhishek (dev)
          // only now, the same bar permanent deletes use.
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

// What an editor sees of a client: its name, their own tasks on it, and
// the documents they edit by (its information, SOP, checklist and
// resources, plus any written for it), all read-only. No billing, no
// analytics, nobody else's work, and no contact details or meeting notes.
async function EditorClientPage({
  client,
  me,
  viewer,
  users,
}: {
  client: NonNullable<Awaited<ReturnType<typeof loadClient>>>;
  me: Awaited<ReturnType<typeof getAllUsers>>[number];
  viewer: Viewer;
  users: Awaited<ReturnType<typeof getAllUsers>>;
}) {
  const [tasks, taskTags, week] = await Promise.all([
    prisma.task.findMany({
      where: { status: { in: ACTIVE_STATUSES }, projectId: { in: client.projects.map((p) => p.id) }, assignedToId: me.id },
      orderBy: { createdAt: "desc" },
      include: { assignedTo: { select: PUBLIC_USER_SELECT }, tags: true, project: { include: { client: { select: PUBLIC_CLIENT_SELECT } } } },
    }),
    prisma.taskTag.findMany({
      where: visibleTagWhere(viewer),
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    weekEntries(client.projects.map((p) => p.id), { assignedToId: me.id, postings: false }),
  ]);
  const logo = logoSrcAt(client.slug, (await logoVersions()).get(client.id));

  return (
    <div className="flex min-h-full flex-col">
      <Link href="/clients" className="mb-6 flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft size={14} /> Clients
      </Link>
      <div className="mb-8 flex">
        <ProfileHead
          photo={
            logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- a data: URI, not an optimizable remote asset
              <img src={logo} alt="" className="photo" style={{ width: "100%", height: "100%" }} />
            ) : (
              <Avatar name={client.name} size="fill" presence={false} />
            )
          }
        >
          <h1 className="text-2xl font-semibold tracking-tight">{client.name}</h1>
          {client.niche && <p className="mt-1 text-sm text-muted">{client.niche}</p>}
        </ProfileHead>
      </div>
      <ClientTabs
        width=""
        tabs={[
          {
            key: "tasks",
            label: "Your tasks",
            count: tasks.length,
            bleed: true,
            content: (
              <div className="flex flex-col gap-8">
                {tasks.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">Nothing of yours for {client.name} right now.</p>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col">
                  <Board
                    tasks={tasks}
                    projects={client.projects.map((p) => ({ id: p.id, name: p.name || p.type, client: { id: client.id, name: client.name } }))}
                    editors={assignOptionsFor(viewer, users)}
                    actingUserId={me.id}
                    actingRole={effectiveRole(me) as Role}
                    canCreate={false}
                    taskTags={taskTags}
                  />
                </div>
              )}
                <WeekCalendar entries={week} today={indiaDay(new Date())} />
              </div>
            ),
          },
          {
            key: "info",
            label: "Client info",
            content: (
              <ClientDocuments
                docs={{ brandGuidelines: client.brandGuidelines, sop: client.sop, qualityChecklist: client.qualityChecklist, resources: client.resources }}
                custom={client.documents.map((d) => ({ id: d.id, title: d.title, content: d.content }))}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
