import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { CalendarGrid, type DayEntry } from "./CalendarGrid";

export const dynamic = "force-dynamic";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) redirect("/login");

  const me = await prisma.user.findUnique({ where: { id: sessionUserId } });
  if (me?.role === "employee") redirect("/tasks"); // admin/core only — a management view

  const { month: monthParam } = await searchParams;
  const now = new Date();
  const [year, month] = monthParam
    ? monthParam.split("-").map(Number)
    : [now.getUTCFullYear(), now.getUTCMonth() + 1];
  const monthIndex = month - 1; // 0-indexed for Date.UTC

  const monthStart = new Date(Date.UTC(year, monthIndex, 1));
  const monthEnd = new Date(Date.UTC(year, monthIndex + 1, 1));

  const logs = await prisma.activityLog.findMany({
    where: { entity: "Task", createdAt: { gte: monthStart, lt: monthEnd } },
    include: { actor: true },
    orderBy: { createdAt: "asc" },
  });

  const taskIds = [...new Set(logs.map((l) => l.entityId))];
  const tasks = await prisma.task.findMany({
    where: { id: { in: taskIds } },
    include: { project: { include: { client: true } } },
  });
  const taskById = new Map(tasks.map((t) => [t.id, t]));

  const days: Record<string, DayEntry[]> = {};
  for (const log of logs) {
    const task = taskById.get(log.entityId);
    if (!task) continue; // task since deleted
    const key = log.createdAt.toISOString().slice(0, 10);
    (days[key] ??= []).push({
      taskId: task.id,
      title: task.title,
      clientName: task.project.client.name,
      action: log.action,
      actorName: log.actor.name,
    });
  }

  const monthLabel = monthStart.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const prev = new Date(Date.UTC(year, monthIndex - 1, 1));
  const next = new Date(Date.UTC(year, monthIndex + 1, 1));
  const toParam = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Calendar</h1>
          <p className="mt-1 text-sm text-muted">
            Every day a task had any activity — created, moved, whatever — shows up here, whether or not it's done.
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link href={`/tasks/calendar?month=${toParam(prev)}`} className="text-muted hover:text-foreground">
            ← Prev
          </Link>
          <span className="font-medium">{monthLabel}</span>
          <Link href={`/tasks/calendar?month=${toParam(next)}`} className="text-muted hover:text-foreground">
            Next →
          </Link>
        </div>
      </div>

      <CalendarGrid year={year} month={monthIndex} days={days} />
    </>
  );
}
