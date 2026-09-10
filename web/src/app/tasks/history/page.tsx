import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { getAllUsers } from "@/lib/users";
import { resolveActingUser } from "@/lib/actingUser";
import type { TaskStatus } from "@/lib/workflow";
import { HistoryList } from "../HistoryList";

export const dynamic = "force-dynamic";

// tasks ops has fully finished with — see page.tsx for the active cutoff
// ("Final export ready" still shows on the live board, visible but not
// actionable for editors, so it isn't history yet)
const COMPLETED_STATUSES: TaskStatus[] = ["delivered_and_uploaded"];

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  const { as } = await searchParams;
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) redirect("/login");

  // logs fetched unfiltered-by-task-id (just entity="Task") so this can run
  // in the same round trip as users/tasks instead of waiting to know which
  // task ids are "visible" first — a small team's total activity log is
  // tiny, cheap to over-fetch and filter in memory below
  const [users, tasks, logs] = await Promise.all([
    getAllUsers(),
    prisma.task.findMany({
      where: { status: { in: COMPLETED_STATUSES }, project: { client: { status: "current" } } },
      orderBy: { updatedAt: "desc" },
      include: { assignedTo: true, project: { include: { client: true } } },
    }),
    prisma.activityLog.findMany({
      where: { entity: "Task" },
      include: { actor: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const actingUser = resolveActingUser(users, sessionUserId, as);
  if (!actingUser) return null;

  const isEditor = actingUser.role === "employee";
  // an editor sees only their own completed work; admin/core see everyone's, for KPI review
  const visible = isEditor ? tasks.filter((t) => t.assignedToId === actingUser.id) : tasks;

  // full per-task audit trail (who created it, every status change and
  // when, by whom) — so clicking a row in HistoryList can show the whole
  // process without a separate fetch per task
  const visibleIds = new Set(visible.map((t) => t.id));
  const logsByTask: Record<string, { createdAt: Date; action: string; actorName: string }[]> = {};
  for (const log of logs) {
    if (!visibleIds.has(log.entityId)) continue;
    (logsByTask[log.entityId] ??= []).push({ createdAt: log.createdAt, action: log.action, actorName: log.actor.name });
  }

  return (
    <>
      <h1 className="mb-6 text-xl font-semibold">History</h1>
      <HistoryList tasks={visible} logsByTask={logsByTask} />
    </>
  );
}
