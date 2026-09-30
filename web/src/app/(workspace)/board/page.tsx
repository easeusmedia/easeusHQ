import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAllUsers, onStaff } from "@/lib/users";
import { isAbhishekOrAdmin } from "@/lib/actingUser";
// one shared definition of "not delivered yet" — this page used to keep
// its own copy, which silently dropped a new status from the board
import { LIVE_TASK, type Role } from "@/lib/workflow";
import { assigneeWhere, isFounder, isMember, runsProduction, visibleClientWhere, visibleTagWhere } from "@/lib/scope";
import { getViewer } from "@/lib/viewer";
import { PUBLIC_USER_SELECT } from "@/lib/publicUser";
import { BoardViews } from "../BoardViews";
import { loadWork } from "../workData";

export const dynamic = "force-dynamic"; // always hits the DB, never statically cached

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const { scope } = await searchParams;
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const member = isMember(viewer);

  const [users, teams, rawProjects, tasks, kinds, held] = await Promise.all([
    getAllUsers(),
    prisma.team.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, slug: true, name: true } }),
    prisma.project.findMany({
      where: { client: { status: "current", ...visibleClientWhere(viewer) } },
      include: { client: true },
      // newest first within each client: a task form lists a client's
      // latest few projects and searches for the rest
      orderBy: [{ client: { name: "asc" } }, { createdAt: "desc" }],
    }),
    // the Production queues: video and design work this person may see
    prisma.task.findMany({
      where: { AND: [LIVE_TASK, assigneeWhere(viewer), { workflow: { in: ["video", "design"] } }] },
      orderBy: { createdAt: "desc" },
      include: { assignedTo: { select: PUBLIC_USER_SELECT }, tags: true, project: { include: { client: true } } },
    }),
    // the kinds of work this person's roles offer, and the ones they may label with
    prisma.taskTag.findMany({ where: visibleTagWhere(viewer), orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    // how the roles this person holds move: which queues are theirs
    prisma.jobTitle.findMany({ where: { holders: { some: { id: viewer.id } } }, select: { workflow: true } }),
  ]);
  // a project set up before names were required can still have "" — fall
  // back to its type so the new/reassign-task dropdown never shows a blank
  const projects = rawProjects.map((p) => ({ ...p, name: p.name || p.type }));

  const actingUser = users.find((u) => u.id === viewer.id);
  if (!actingUser) redirect("/login");

  // Who Production work can go to: a Member only themselves; a Founder any
  // Member, or themselves; a Lead the Members in their departments, or
  // themselves (lib/scope canAssign)
  const deptIds = viewer.departments.map((d) => d.id);
  const editors = member
    ? users.filter((u) => u.id === viewer.id)
    : users.filter((u) => onStaff(u) && (u.id === viewer.id || (u.role === "employee" && (isFounder(viewer) || (!!u.teamId && deptIds.includes(u.teamId))))));

  // The switch: the Production queues (Video, Design) for whoever works or
  // runs them, then each department's work for whoever runs it. A Member
  // gets the queues their roles work in, and nothing else.
  const mine = new Set(held.map((r) => r.workflow));
  const hasOwn = (w: string) => tasks.some((t) => t.workflow === w && t.assignedToId === viewer.id);
  const queue = (w: "video" | "design") => (member ? mine.has(w) || hasOwn(w) : runsProduction(viewer) || mine.has(w) || hasOwn(w));
  const teamScopes = member
    ? []
    : [
        ...(isFounder(viewer) ? teams : teams.filter((t) => deptIds.includes(t.id))).map((t) => ({ key: t.slug, label: t.name })),
        ...(isFounder(viewer) ? [{ key: "all", label: "Everyone" }] : []),
      ];
  const scopes = [
    ...(queue("video") ? [{ key: "editors", label: "Video" }] : []),
    ...(queue("design") ? [{ key: "design", label: "Design" }] : []),
    ...teamScopes,
  ];
  // "org" (what a client page links to) means the widest team view you have
  const wanted = scope === "org" ? teamScopes.at(-1)?.key : scope;
  const initialScope = scopes.find((s) => s.key === wanted)?.key ?? scopes[0]?.key ?? "mine";

  // a scheduled-for-the-future task stays off the assigned Member's board
  // until that date — Founders and Leads always see everything
  const visibleTasks = member ? tasks.filter((t) => !t.scheduledFor || t.scheduledFor <= new Date()) : tasks;

  const canSyncNotion = isAbhishekOrAdmin(actingUser);
  const work = member ? null : await loadWork(viewer, "all", { withQueue: true });
  const tagOptions = kinds.map((k) => ({ id: k.id, name: k.name, clientFacing: k.clientFacing, workflow: k.workflow }));
  const env = { projects, editors, actingUserId: actingUser.id, actingRole: actingUser.role as Role };

  return (
    <BoardViews
      scopes={scopes.length ? scopes : [{ key: "mine", label: "Mine" }]}
      initialScope={initialScope}
      editors={{ ...env, tasks: visibleTasks.filter((t) => t.workflow !== "design"), taskTags: tagOptions.filter((k) => k.workflow === "video") }}
      design={{ ...env, tasks: visibleTasks.filter((t) => t.workflow === "design"), taskTags: tagOptions.filter((k) => k.workflow === "design") }}
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
