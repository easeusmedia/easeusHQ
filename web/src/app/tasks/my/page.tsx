import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { ACTIVE_STATUSES } from "@/lib/workflow";
import { STAGE } from "@/lib/stages";
import { seesEveryTeam, visibleTagWhere, type Viewer } from "@/lib/scope";
import { WorkTaskView } from "./WorkTaskView";
import { ScopeToggle } from "./ScopeToggle";
import type { WorkTaskLink, WorkTaskAttachment } from "./actions";

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

  const where =
    active === "mine"
      ? { assignedToId: me.id }
      : active === "all"
        ? {}
        : { assignedTo: { team: { slug: active } } };

  const [projectsRaw, workTasks, clientTasks, taskTags, assignable] = await Promise.all([
    prisma.project.findMany({
      where: { client: { status: "current" } },
      include: { client: true },
      orderBy: { client: { name: "asc" } },
    }),
    prisma.workTask.findMany({
      where,
      include: { assignedTo: true, createdBy: true, tags: true, project: { include: { client: true } } },
      orderBy: { sortOrder: "asc" },
    }),
    // read-only: whatever's already on this person's plate on the client
    // editing queue shows up here too, so "my work" is genuinely everything
    // and not just this system's own tasks. Only in the "mine" view — the
    // editing queue has its own board for the team-wide picture.
    active === "mine"
      ? prisma.task.findMany({
          where: { assignedToId: me.id, status: { in: ACTIVE_STATUSES } },
          orderBy: { createdAt: "desc" },
          include: { project: { include: { client: true } } },
        })
      : Promise.resolve([]),
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
    assignedTo: { id: t.assignedTo.id, name: t.assignedTo.name },
    createdBy: { id: t.createdBy.id, name: t.createdBy.name },
  }));

  return (
    <div className="flex flex-col gap-4">
      {/* no page heading: the sidebar already says where you are, and that
          row is better spent on the control that actually changes what's
          on screen */}
      {options.length > 1 && <ScopeToggle options={options} active={active} />}

      {clientTasks.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Assigned on the editing queue</h2>
          <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface/40">
            {clientTasks.map((t) => (
              <a
                key={t.id}
                href="/tasks"
                className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm hover:bg-surface-2"
              >
                <span className="min-w-0 truncate">
                  <span className="text-muted">{t.project.client.name}</span> · {t.title}
                </span>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${STAGE[t.status].pill}`}>
                  {STAGE[t.status].label}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      <WorkTaskView
        tasks={tasks}
        projects={projects}
        actingUserId={me.id}
        showAssignee={active !== "mine"}
        canCreate
        assignees={assignable}
        taskTags={taskTags.map((t) => ({ id: t.id, name: t.name, clientFacing: t.clientFacing }))}
      />
    </div>
  );
}
