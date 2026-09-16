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

  // One switch, top right: Editors (the editing queue, the thing the studio
  // runs on), then your team's work (every team, and Everyone, for admin and
  // Abhishek) — editors' edits included, laid out by person or team. An
  // editor only ever gets the editing queue, so no switch at all; a lead
  // outside Operations never gets it, since it isn't their team's work.
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
  const activeScope = scopes.find((s) => s.key === wanted)?.key ?? scopes[0]?.key ?? "mine";
  const scopeToggle = scopes.length > 1 && <ScopeToggle options={scopes} active={activeScope} />;

  if (activeScope !== "editors") {
    const groupOptions: GroupBy[] = activeScope === "all" ? ["person", "team"] : ["person"];
    const work = await loadWork(viewer, activeScope, { withQueue: true });

    return (
      <div className="-m-6 flex h-[calc(100%+3rem)] w-[calc(100%+3rem)] flex-col sm:-m-8 sm:h-[calc(100%+4rem)] sm:w-[calc(100%+4rem)]">
        <div className="min-h-0 flex-1 overflow-y-auto p-6 sm:p-8">
          <WorkTaskView
            tasks={work.tasks}
            queueTasks={work.queueTasks}
            groupOptions={groupOptions}
            teams={teams}
            projects={work.projects}
            actingUserId={actingUser.id}
            showAssignee
            canCreate
            assignees={work.assignable}
            taskTags={work.taskTags}
            canManageTags
            toolbarRight={scopeToggle}
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
      {/* the switch sits where it does on the team views, top right; the
          negative bottom margin eats most of the columns' own top padding
          so the gap below it matches theirs too */}
      {scopeToggle && (
        <div className="-mb-2 flex shrink-0 justify-end px-6 pt-6 sm:-mb-4 sm:px-8 sm:pt-8">{scopeToggle}</div>
      )}
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
