import Link from "next/link";
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
import { Board } from "./Board";
import { NotionSyncButton } from "./NotionSyncButton";
import { ScopeToggle } from "./ScopeToggle";
import { loadWork } from "./workData";
import { WorkTaskView } from "./my/WorkTaskView";
import type { GroupBy } from "@/lib/workTaskStages";

export const dynamic = "force-dynamic"; // always hits the DB, never statically cached

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string; view?: string; scope?: string }>;
}) {
  const { as, view, scope } = await searchParams;
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

  // Two tabs. Editors: the editing queue, the thing the studio runs on.
  // Organization: everyone's work in your team (every team, for admin and
  // Abhishek), editors' edits included, laid out by team, role or person.
  // An editor only ever gets the first; a lead outside Operations only the
  // second, since the editing queue isn't their team's work.
  const viewer = { id: actingUser.id, role: actingUser.role, email: actingUser.email, teamId: actingUser.teamId };
  const everyTeam = seesEveryTeam(viewer);
  const myTeam = teams.find((t) => t.id === actingUser.teamId);
  const views = [
    ...(isEditor || everyTeam || myTeam?.slug === "operations" ? [{ key: "editors", label: "Editors" }] : []),
    ...(!isEditor ? [{ key: "org", label: "Organization" }] : []),
  ];
  const activeView = views.find((v) => v.key === view)?.key ?? views[0].key;
  // the "viewing as" choice rides along on every tab link
  const hrefFor = (key: string) => {
    const params = new URLSearchParams();
    if (as) params.set("as", as);
    if (key !== views[0].key) params.set("view", key);
    const qs = params.toString();
    return qs ? `/tasks?${qs}` : "/tasks";
  };
  const tabStrip = views.length > 1 && (
    <nav className="flex shrink-0 gap-1 border-b border-border px-6 pt-4 sm:px-8">
      {views.map((v) => (
        <Link
          key={v.key}
          href={hrefFor(v.key)}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
            activeView === v.key ? "border-foreground text-foreground" : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          {v.label}
        </Link>
      ))}
    </nav>
  );

  if (activeView === "org") {
    const scopes = [
      ...(everyTeam ? teams : myTeam ? [myTeam] : []).map((t) => ({ key: t.slug, label: t.name })),
      ...(everyTeam ? [{ key: "all", label: "Everyone" }] : []),
    ];
    // widest view first: Everyone for admin, your own team for a lead
    const activeScope = scopes.find((s) => s.key === scope)?.key ?? scopes.at(-1)?.key ?? "mine";
    const groupOptions: GroupBy[] = activeScope === "all" ? ["team", "role", "person"] : ["role", "person"];
    const work = await loadWork(viewer, activeScope, { withQueue: true });

    return (
      <div className="-m-6 flex h-[calc(100%+3rem)] w-[calc(100%+3rem)] flex-col sm:-m-8 sm:h-[calc(100%+4rem)] sm:w-[calc(100%+4rem)]">
        {tabStrip}
        <div className="min-h-0 flex-1 overflow-y-auto p-6 sm:p-8">
          <WorkTaskView
            tasks={work.tasks}
            queueTasks={work.queueTasks}
            groupOptions={groupOptions}
            teams={teams}
            roles={work.roles}
            projects={work.projects}
            actingUserId={actingUser.id}
            showAssignee
            canCreate
            assignees={work.assignable}
            taskTags={work.taskTags}
            canManageTags
            toolbarRight={scopes.length > 1 && <ScopeToggle options={scopes} active={activeScope} />}
          />
        </div>
      </div>
    );
  }
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

  // Cancels the layout's page padding on all four sides and grows to cover
  // it (a negative margin alone moves what follows, not this element's own
  // edges). The board then owns the full window, so its scrollbars sit on
  // the real edges instead of floating 32px inside them, and the padding is
  // re-applied inside the scroll area where it can't clip anything.
  return (
    <div className="-m-6 flex h-[calc(100%+3rem)] w-[calc(100%+3rem)] flex-col sm:-m-8 sm:h-[calc(100%+4rem)] sm:w-[calc(100%+4rem)]">
      {tabStrip}
      {/* the same board for everyone — editors used to get a separate
          List/Board toggle onto a simplified view; now it's exactly what
          ops sees, just pre-filtered to their own tasks (see visibleTasks
          above) rather than a different dashboard */}
      <Board
        tasks={visibleTasks}
        projects={projects}
        editors={editors}
        actingUserId={actingUser.id}
        actingRole={actingUser.role as Role}
        canCreate
        taskTags={taskTags}
      />

      {canSyncNotion && <NotionSyncButton />}
    </div>
  );
}
