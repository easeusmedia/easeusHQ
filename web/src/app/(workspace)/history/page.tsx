import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { getAllUsers } from "@/lib/users";
import { isAbhishekOrAdmin } from "@/lib/actingUser";
import type { TaskStatus } from "@/lib/workflow";
import { assigneeWhere, isFounder } from "@/lib/scope";
import { DeletedRecord } from "./DeletedRecord";
import { getViewer } from "@/lib/viewer";
import { PUBLIC_CLIENT_SELECT, PUBLIC_USER_SELECT } from "@/lib/publicUser";
import type { HistoryItem } from "@/lib/history";
import { displayTeam } from "@/lib/teams";
import { parseStageChange } from "@/lib/stages";
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
export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ person?: string }> }) {
  // person: arriving from someone's profile, already filtered to them
  const { person } = await searchParams;
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) redirect("/login");

  const users = await getAllUsers();
  const actingUser = users.find((u) => u.id === sessionUserId);
  if (!actingUser) return null;

  const viewer = await getViewer();
  if (!viewer) return null;
  // the record of finished and deleted work is Level 1's
  if (!isFounder(viewer)) redirect("/home");
  const scope = assigneeWhere(viewer);

  const [tasks, workTasks, logs] = await Promise.all([
    prisma.task.findMany({
      where: { ...scope, status: { in: COMPLETED_STATUSES }, project: { client: { status: "current" } } },
      orderBy: { updatedAt: "desc" },
      include: {
        assignedTo: { select: { ...PUBLIC_USER_SELECT, role: true, team: { select: { slug: true, name: true } } } },
        tags: true,
        project: { include: { client: { select: PUBLIC_CLIENT_SELECT } } },
      },
    }),
    prisma.workTask.findMany({
      where: { ...scope, status: "done" },
      orderBy: { completedAt: "desc" },
      include: {
        assignedTo: { select: { ...PUBLIC_USER_SELECT, role: true, team: { select: { slug: true, name: true } } } },
        createdBy: { select: { name: true } },
        tags: true,
        project: { include: { client: { select: PUBLIC_CLIENT_SELECT } } },
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

  const canDelete = isAbhishekOrAdmin(actingUser);

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
    const editing = trail.find((l) => parseStageChange(l.action)?.to === "editing");
    const firstMove = trail.find((l) => parseStageChange(l.action));
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
      team: t.assignedTo ? displayTeam(t.assignedTo)?.name ?? null : null,
      client: t.project.client.name,
      project: t.project.name || t.project.type,
      tags: t.tags.map((tag) => tag.name),
      createdAt: t.createdAt,
      startedAt: startedAt(t.id),
      completedAt: t.updatedAt,
      dueDate: t.dueDate,
      handedOffAt: t.handedOffAt,
      revisions: t.revisionCount,
      tier: t.tier,
    })),
    ...workTasks.map((t) => ({
      id: t.id,
      kind: "internal" as const,
      title: t.title,
      personId: t.assignedTo.id,
      person: t.assignedTo.name,
      team: displayTeam(t.assignedTo)?.name ?? null,
      client: t.project?.client.name ?? null,
      project: t.project ? t.project.name || t.project.type : null,
      tags: t.tags.map((tag) => tag.name),
      createdAt: t.createdAt,
      // a work task records no stage changes, so "started" is unknown
      startedAt: null,
      completedAt: t.completedAt ?? t.updatedAt,
      dueDate: t.dueDate,
      handedOffAt: null,
      revisions: 0,
    })),
  ].sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());

  // everything worth reading when a row is opened — the task itself, not
  // just the numbers History works out from it
  const details = Object.fromEntries([
    ...tasks.map((t) => [
      t.id,
      {
        // the delivered file and nothing else: raw footage and the Frame.io
        // thread are cleared after a project wraps, so History would be
        // offering dead links (and shipping them to the browser) for the
        // rest of the record's life
        drive: t.driveLink,
        notes: t.editingNotes,
        reviewNotes: t.reviewNotes,
        internal: t.internal,
        links: [] as { label: string; url: string }[],
        createdBy: null as string | null,
      },
    ]),
    ...workTasks.map((t) => [
      t.id,
      {
        drive: null,
        notes: t.notes,
        reviewNotes: null,
        internal: false,
        links: ((t.links as { label: string; url: string }[] | null) ?? []).filter((l) => l?.url),
        createdBy: t.createdBy.name,
      },
    ]),
  ]);

  // what was deleted, by whom and why: Level 1 sees it all; anyone else what they deleted
  const deleted = await prisma.deletedTask.findMany({ where: isFounder(viewer) ? {} : { byId: viewer.id }, orderBy: { deletedAt: "desc" }, take: 200 });

  return (
    <>
      <HistoryExplorer
        items={items}
        details={details}
        logsByTask={logsByTask}
        canDelete={canDelete}
        initialFilters={person ? { personId: person } : {}}
      />
      <DeletedRecord
        rows={deleted.map((d) => ({ id: d.id, title: d.title, client: d.client, assignee: d.assignee, by: d.byName, reason: d.reason, at: d.deletedAt.toISOString() }))}
        canRestore={isFounder(viewer)}
      />
    </>
  );
}
