import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { assignableEditors, getAllUsers } from "@/lib/users";
import { resolveActingUser, isAbhishekOrAdmin } from "@/lib/actingUser";
// one shared definition of "not delivered yet" — this page used to keep
// its own copy, which silently dropped a new status from the board
import { ACTIVE_STATUSES, type Role } from "@/lib/workflow";
import { seesEveryTeam, visibleTagWhere } from "@/lib/scope";
import { PUBLIC_USER_SELECT } from "@/lib/publicUser";
import { BoardViews } from "../BoardViews";
import { loadWork } from "../workData";

export const dynamic = "force-dynamic"; // always hits the DB, never statically cached

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string; scope?: string }>;
}) {
  const { as, scope } = await searchParams;
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) redirect("/login");

  const [users, teams, rawProjects, tasks] = await Promise.all([
    getAllUsers(),
    prisma.team.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, slug: true, name: true } }),
    prisma.project.findMany({
      where: { client: { status: "current" } },
      include: { client: true },
      orderBy: { client: { name: "asc" } },
    }),
    prisma.task.findMany({
      where: { status: { in: ACTIVE_STATUSES }, project: { client: { status: "current" } } },
      orderBy: { createdAt: "desc" },
      include: { assignedTo: { select: PUBLIC_USER_SELECT }, tags: true, project: { include: { client: true } } },
    }),
  ]);
  // a project set up before names were required can still have "" — fall
  // back to its type so the new/reassign-task dropdown never shows a blank
  const projects = rawProjects.map((p) => ({ ...p, name: p.name || p.type }));

  const editors = assignableEditors(users); // ops (admin/core) don't edit, they manage
  const actingUser = resolveActingUser(users, sessionUserId, as);

  if (!actingUser) {
    return (
      <>
        <h1 className="mb-6 text-xl font-semibold">No users yet</h1>
        <p className="text-sm text-muted">
          Run the seed script (<code>npx prisma db seed</code>) once <code>DATABASE_URL</code> is set.
        </p>
      </>
    );
  }

  const isEditor = actingUser.role === "employee";

  // One switch, centred: Editors (the editing queue, the thing the studio
  // runs on), then whose work — editors' edits included, laid out by person
  // or team. Only admin and Abhishek see every team and Everyone. A core
  // member sees their own team, plus the editing queue if that team is
  // Operations (the editors are Operations). An editor only ever gets their
  // own editing queue, so no switch at all.
  const viewer = { id: actingUser.id, role: actingUser.role, email: actingUser.email, teamId: actingUser.teamId };
  const everyTeam = seesEveryTeam(viewer);
  const myTeam = teams.find((t) => t.id === actingUser.teamId);
  const teamScopes = isEditor
    ? []
    : [
        ...(everyTeam ? teams : myTeam ? [myTeam] : []).map((t) => ({ key: t.slug, label: t.name })),
        ...(everyTeam ? [{ key: "all", label: "Everyone" }] : []),
      ];
  const scopes = [
    ...(isEditor || everyTeam || myTeam?.slug === "operations" ? [{ key: "editors", label: "Editors" }] : []),
    ...teamScopes,
  ];
  // "org" (what a client page links to) means the widest team view you have
  const wanted = scope === "org" ? teamScopes.at(-1)?.key : scope;
  const initialScope = scopes.find((s) => s.key === wanted)?.key ?? scopes[0]?.key ?? "mine";

  // Everything this person may switch between, loaded once — the switch
  // itself happens in the browser (BoardViews). The team views read the
  // widest work they can see and filter it down to one team.
  const widest = everyTeam ? "all" : isEditor ? null : (myTeam?.slug ?? "mine");
  const work = widest ? await loadWork(viewer, widest, { withQueue: true }) : null;

  // a scheduled-for-the-future task stays off the assigned editor's board
  // until that date — ops/admin (the `else` below) always sees everything
  const visibleTasks = isEditor
    ? tasks.filter((t) => t.assignedToId === actingUser.id && (!t.scheduledFor || t.scheduledFor <= new Date()))
    : tasks;

  // based on who's actually signed in, not the "viewing as" impersonation —
  // same rule as History's delete button (see history/page.tsx)
  const realUser = users.find((u) => u.id === sessionUserId);
  const canSyncNotion = !!realUser && isAbhishekOrAdmin(realUser);

  // only this person's own team's kinds of work (plus any shared ones) —
  // Sales never has to pick past "Colour correction"
  const taskTags = realUser
    ? await prisma.taskTag.findMany({
        where: visibleTagWhere({ id: realUser.id, role: realUser.role, email: realUser.email, teamId: realUser.teamId }),
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      })
    : [];

  return (
    <BoardViews
      scopes={scopes.length ? scopes : [{ key: "mine", label: "Mine" }]}
      initialScope={initialScope}
      editors={{
        // the same view for everyone — pre-filtered to an editor's own tasks
        tasks: visibleTasks,
        projects,
        editors,
        actingUserId: actingUser.id,
        actingRole: actingUser.role as Role,
        taskTags,
      }}
      work={
        work && {
          tasks: work.tasks,
          queueTasks: work.queueTasks,
          queueEnv: { editors, projects: work.projects, actingUserId: actingUser.id, actingRole: actingUser.role as Role, taskTags: work.taskTags },
          teams,
          projects: work.projects,
          assignable: work.assignable,
          taskTags: work.taskTags,
        }
      }
      canSyncNotion={canSyncNotion}
    />
  );
}
