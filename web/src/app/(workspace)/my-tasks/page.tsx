import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAllUsers, assignOptionsFor } from "@/lib/users";
import { getViewer } from "@/lib/viewer";
import { assigneeWhere, effectiveRole, isMember, worksTheBoard } from "@/lib/scope";
import { ACTIVE_STATUSES } from "@/lib/workflow";
import { dayOf } from "@/lib/editorKpi";
import { PUBLIC_USER_SELECT } from "@/lib/publicUser";
import { loadWork } from "../workData";
import { TodoList } from "./TodoList";
import { WorkNotionSyncButton } from "./WorkNotionSyncButton";

export const dynamic = "force-dynamic";

// Your own work, as a to-do list: your to-dos and your client work
// together, by the day each is due. A Member in Production works from the
// Board instead, where their stages are.
export default async function MyTasksPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (worksTheBoard(viewer)) redirect("/board");
  const { view } = await searchParams;
  // Level 1 and 2 also see the to-dos of everyone they oversee
  const oversees = !isMember(viewer);

  // eslint-disable-next-line react-hooks/purity -- a server render: "now" is the moment of this request
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [work, users, tasks, done, doneTasks, kinds, me, team, teamTasks] = await Promise.all([
    loadWork(viewer, "mine", { withQueue: false }),
    getAllUsers(),
    // your client work: anything still open, whatever its stages
    prisma.task.findMany({
      where: { assignedToId: viewer.id, status: { in: ACTIVE_STATUSES }, project: { client: { status: "current" } } },
      include: { assignedTo: { select: PUBLIC_USER_SELECT }, tags: true, project: { include: { client: true } } },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    }),
    // and the last week's finished, to tick back if it was a slip
    prisma.workTask.findMany({ where: { assignedToId: viewer.id, status: "done", completedAt: { gte: since } }, select: { id: true, title: true, completedAt: true }, orderBy: { completedAt: "desc" } }),
    prisma.task.findMany({
      where: { assignedToId: viewer.id, status: "delivered_and_uploaded", updatedAt: { gte: since } },
      select: { id: true, title: true, updatedAt: true, workflow: true, project: { select: { client: { select: { name: true } } } } },
      orderBy: { updatedAt: "desc" },
    }),
    // your Production roles and their kinds of work: what "Add task" offers
    // (everyone else's work is a plain to-do)
    prisma.jobTitle.findMany({
      where: { holders: { some: { id: viewer.id } }, team: { slug: "production" } },
      select: { id: true, name: true, workflow: true, team: { select: { name: true } }, kinds: { select: { id: true, name: true, workflow: true, clientFacing: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.user.findUnique({ where: { id: viewer.id }, select: { notionWorkbookDbId: true, team: { select: { slug: true } } } }),
    oversees ? loadWork(viewer, "all", { withQueue: false }) : null,
    // the team's client to-dos (their videos and designs are on the Board)
    oversees
      ? prisma.task.findMany({
          where: { AND: [assigneeWhere(viewer), { status: { in: ACTIVE_STATUSES }, workflow: "todo", assignedToId: { not: viewer.id }, project: { client: { status: "current" } } }] },
          include: { assignedTo: { select: PUBLIC_USER_SELECT }, tags: true, project: { include: { client: true } } },
          orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
        })
      : [],
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <TodoList
        today={dayOf(new Date())}
        todos={work.tasks}
        tasks={tasks}
        done={[
          ...done.map((t) => ({ id: t.id, title: t.title, kind: "todo" as const, at: (t.completedAt ?? since).toISOString(), client: null })),
          ...doneTasks.map((t) => ({ id: t.id, title: t.title, kind: "task" as const, workflow: t.workflow, at: t.updatedAt.toISOString(), client: t.project.client.name })),
        ].sort((a, b) => b.at.localeCompare(a.at))}
        // each role's kinds of work, or the role itself when it has none
        kinds={kinds.flatMap((r) =>
          r.kinds.length
            ? r.kinds.map((k) => ({ id: k.id, name: k.name, workflow: k.workflow, clientFacing: k.clientFacing, department: r.team?.name ?? null }))
            : [{ id: `role:${r.id}`, name: r.name, workflow: r.workflow, clientFacing: false, department: r.team?.name ?? null }]
        )}
        projects={work.projects}
        assignees={work.assignable}
        editors={assignOptionsFor(viewer, users).map((u) => ({ id: u.id, name: u.name }))}
        taskTags={work.taskTags}
        actingUserId={viewer.id}
        actingRole={effectiveRole(viewer)}
        team={team && { todos: team.tasks.filter((t) => t.assignedTo.id !== viewer.id), tasks: teamTasks }}
        initialView={view === "team" ? "team" : "mine"}
      />
      {(!!me?.notionWorkbookDbId || me?.team?.slug === "production" || me?.team?.slug === "client-services") && (
        <div className="mt-8 flex justify-center">
          <WorkNotionSyncButton />
        </div>
      )}
    </div>
  );
}
