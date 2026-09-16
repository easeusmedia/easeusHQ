import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { ACTIVE_STATUSES } from "@/lib/workflow";
import { seesEveryTeam, visibleTagWhere, type Viewer } from "@/lib/scope";
import { PUBLIC_USER_SELECT } from "@/lib/publicUser";
import { WorkTaskView } from "./WorkTaskView";
import { ScopeToggle } from "./ScopeToggle";
import { WorkNotionSyncButton } from "./WorkNotionSyncButton";
import type { WorkTaskLink, WorkTaskAttachment } from "./actions";
import type { GroupBy } from "@/lib/workTaskStages";

export const dynamic = "force-dynamic";

// Everyone's work, scoped to what you're allowed to see.
//
// This page used to be "My Tasks" with an admin-only Abhishek/Everyone
// switch bolted on. It's the team's work board now: an employee still sees
// exactly their own, but a core member sees everything their team is doing
// and admin sees every team — picked with the toggle at the top rather than
// by impersonating someone from the sidebar.
export default async function WorkPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const { scope } = await searchParams;
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) redirect("/login");

  const me = await prisma.user.findUnique({
    where: { id: sessionUserId },
    include: { team: true },
  });
  if (!me) redirect("/login");

  const viewer: Viewer = { id: me.id, role: me.role, email: me.email, teamId: me.teamId };
  const everyTeam = seesEveryTeam(viewer);

  // What this person may switch between. An employee gets no toggle at all
  // — there is only one thing they can see, and a one-option control is
  // just noise.
  const teams = everyTeam
    ? await prisma.team.findMany({ orderBy: { sortOrder: "asc" } })
    : me.team
      ? [me.team]
      : [];
  const canPickTeam = me.role !== "employee" && teams.length > 0;
  const options = [
    { key: "mine", label: "Mine" },
    ...(canPickTeam ? teams.map((t) => ({ key: t.slug, label: t.name })) : []),
    ...(everyTeam ? [{ key: "all", label: "Everyone" }] : []),
  ];

  // Default to the widest view this person has: a core member opens onto
  // their team's work, because that's the job; an employee onto their own.
  const fallback = options.length > 1 ? options[options.length - 1].key : "mine";
  const active = options.some((o) => o.key === scope) ? scope! : fallback;

  // one filter for both kinds of task: yours, one team's (everyone on it,
  // editors included, whatever their role), or everything
  const where =
    active === "mine"
      ? { assignedToId: me.id }
      : active === "all"
        ? {}
        : { assignedTo: { team: { slug: active } } };
  // Your own work is a status board. Anyone else's is laid out by who's
  // doing it (or, across every team, by team) — status is on each card.
  const groupOptions: GroupBy[] = active === "mine" ? ["status"] : active === "all" ? ["person", "team"] : ["person"];
  const assigneeSelect = { select: { ...PUBLIC_USER_SELECT, team: { select: { slug: true, name: true } } } };

  const [projectsRaw, workTasks, queueTasks, taskTags, assignable] = await Promise.all([
    prisma.project.findMany({
      where: { client: { status: "current" } },
      include: { client: true },
      orderBy: { client: { name: "asc" } },
    }),
    prisma.workTask.findMany({
      where,
      include: { assignedTo: assigneeSelect, createdBy: { select: PUBLIC_USER_SELECT }, tags: true, project: { include: { client: true } } },
      orderBy: { sortOrder: "asc" },
    }),
    // Editors' work lives on the client editing queue, a separate system —
    // without it "Everyone" missed most of what the team is doing. Shown
    // read-only in every scope, under the same filter as the work tasks.
    prisma.task.findMany({
      where: { ...where, status: { in: ACTIVE_STATUSES } },
      orderBy: { createdAt: "desc" },
      include: { assignedTo: assigneeSelect, project: { include: { client: true } } },
    }),
    prisma.taskTag.findMany({ where: visibleTagWhere(viewer), orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    // who work can be handed to: everyone, your own team, or only you
    prisma.user.findMany({
      where: everyTeam
        ? { employment: "active" }
        : me.role === "core" && me.teamId
          ? { teamId: me.teamId, employment: "active" }
          : { id: me.id },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const projects = projectsRaw.map((p) => ({ id: p.id, name: p.name || p.type, client: { name: p.client.name } }));

  const tasks = workTasks.map((t) => ({
    id: t.id,
    title: t.title,
    notes: t.notes,
    status: t.status,
    category: t.category,
    tags: t.tags.map((tag) => ({ id: tag.id, name: tag.name })),
    dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
    sortOrder: t.sortOrder,
    links: (t.links as WorkTaskLink[]) ?? [],
    attachments: (t.attachments as WorkTaskAttachment[]) ?? [],
    projectId: t.projectId,
    project: t.project ? { name: t.project.name || t.project.type, client: { name: t.project.client.name } } : null,
    assignedTo: { id: t.assignedTo.id, name: t.assignedTo.name, team: t.assignedTo.team },
    createdBy: { id: t.createdBy.id, name: t.createdBy.name },
  }));

  return (
    <div className="flex flex-col gap-4">
      {/* no page heading: the sidebar already says where you are. The scope
          picker rides in WorkTaskView's own toolbar row (right-hand side)
          rather than sitting on a row of its own above it. */}
      <WorkTaskView
        tasks={tasks}
        queueTasks={queueTasks.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          client: t.project.client.name,
          project: t.project.name || t.project.type,
          assignedTo: t.assignedTo && { id: t.assignedTo.id, name: t.assignedTo.name, team: t.assignedTo.team },
        }))}
        groupOptions={groupOptions}
        teams={teams.map((t) => ({ slug: t.slug, name: t.name }))}
        projects={projects}
        actingUserId={me.id}
        showAssignee={active !== "mine"}
        canCreate
        assignees={assignable}
        taskTags={taskTags.map((t) => ({ id: t.id, name: t.name, clientFacing: t.clientFacing }))}
        canManageTags={me.role !== "employee"}
        toolbarRight={
          <>
            {/* shown to anyone whose work has a home in Notion — a core
                member with their own workbook, or Operations */}
            {me.role !== "employee" && (!!me.notionWorkbookDbId || me.team?.slug === "operations") && (
              <WorkNotionSyncButton />
            )}
            {options.length > 1 && <ScopeToggle options={options} active={active} />}
          </>
        }
      />
    </div>
  );
}
