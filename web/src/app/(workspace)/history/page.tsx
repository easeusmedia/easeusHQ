import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { getAllUsers } from "@/lib/users";
import { resolveActingUser, isAbhishekOrAdmin } from "@/lib/actingUser";
import type { TaskStatus } from "@/lib/workflow";
import { assigneeWhere } from "@/lib/scope";
import { PUBLIC_USER_SELECT } from "@/lib/publicUser";
import type { HistoryItem } from "@/lib/history";
import { HistoryExplorer } from "./HistoryExplorer";

export const dynamic = "force-dynamic";

// Work that's finished with. An editing-queue task ends at "delivered and
// uploaded" ("Final export ready" still sits on the live board), and a work
// task ends at "done".
const COMPLETED_STATUSES: TaskStatus[] = ["delivered_and_uploaded"];

// The record of everything this company has finished — both task systems in
// one list, so "how much did we get done, by whom, how fast" can be asked of
// the company rather than of one board. Who sees whose work is the same
// three rings the rest of the app uses (lib/scope): your own work, your
// team's, or everyone's.
export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ as?: string }> }) {
  const { as } = await searchParams;
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) redirect("/login");

  const users = await getAllUsers();
  const actingUser = resolveActingUser(users, sessionUserId, as);
  if (!actingUser) return null;

  const viewer = { id: actingUser.id, role: actingUser.role, email: actingUser.email, teamId: actingUser.teamId };
  const scope = assigneeWhere(viewer);

  const [tasks, workTasks, logs] = await Promise.all([
    prisma.task.findMany({
      where: { ...scope, status: { in: COMPLETED_STATUSES }, project: { client: { status: "current" } } },
      orderBy: { updatedAt: "desc" },
      include: {
        assignedTo: { select: { ...PUBLIC_USER_SELECT, team: { select: { name: true } } } },
        tags: true,
        project: { include: { client: true } },
      },
    }),
    prisma.workTask.findMany({
      where: { ...scope, status: "done" },
      orderBy: { completedAt: "desc" },
      include: {
        assignedTo: { select: { ...PUBLIC_USER_SELECT, team: { select: { name: true } } } },
        tags: true,
        project: { include: { client: true } },
      },
    }),
    // the whole trail, so clicking a row shows every step without another
    // fetch — a small team's log is cheap to over-fetch and filter here
    prisma.activityLog.findMany({
      where: { entity: "Task" },
      include: { actor: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // based on who's actually signed in, not "viewing as": Abhishek looking at
  // the board as an editor shouldn't lose this, and an editor being previewed
  // shouldn't gain it
  const realUser = users.find((u) => u.id === sessionUserId);
  const canDelete = !!realUser && isAbhishekOrAdmin(realUser);

  const visibleIds = new Set(tasks.map((t) => t.id));
  const logsByTask: Record<string, { createdAt: string; action: string; actorName: string }[]> = {};
  for (const log of logs) {
    if (!visibleIds.has(log.entityId)) continue;
    (logsByTask[log.entityId] ??= []).push({
      createdAt: log.createdAt.toISOString(),
      action: log.action,
      actorName: log.actor.name,
    });
  }

  // when the work actually started: the first move into editing, else the
  // first move of any kind
  const startedAt = (taskId: string): Date | null => {
    const trail = logsByTask[taskId] ?? [];
    const editing = trail.find((l) => l.action.endsWith("→ editing"));
    const firstMove = trail.find((l) => l.action.includes("→"));
    const at = editing?.createdAt ?? firstMove?.createdAt;
    return at ? new Date(at) : null;
  };

  const items: HistoryItem[] = [
    ...tasks.map((t) => ({
      id: t.id,
      kind: "client" as const,
      title: t.title,
      personId: t.assignedTo?.id ?? "unassigned",
      person: t.assignedTo?.name ?? "Unassigned",
      team: t.assignedTo?.team?.name ?? null,
      client: t.project.client.name,
      project: t.project.name || t.project.type,
      tags: t.tags.map((tag) => tag.name),
      createdAt: t.createdAt,
      startedAt: startedAt(t.id),
      completedAt: t.updatedAt,
      dueDate: t.dueDate,
      revisions: t.revisionCount,
    })),
    ...workTasks.map((t) => ({
      id: t.id,
      kind: "internal" as const,
      title: t.title,
      personId: t.assignedTo.id,
      person: t.assignedTo.name,
      team: t.assignedTo.team?.name ?? null,
      client: t.project?.client.name ?? null,
      project: t.project ? t.project.name || t.project.type : null,
      tags: t.tags.map((tag) => tag.name),
      createdAt: t.createdAt,
      // a work task records no stage changes, so "started" is unknown
      startedAt: null,
      completedAt: t.completedAt ?? t.updatedAt,
      dueDate: t.dueDate,
      revisions: 0,
    })),
  ].sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());

  const links = Object.fromEntries(
    tasks.map((t) => [t.id, { drive: t.driveLink, frameio: t.frameioLink }])
  );

  return (
    <HistoryExplorer
      items={items}
      links={links}
      logsByTask={logsByTask}
      canDelete={canDelete}
    />
  );
}
