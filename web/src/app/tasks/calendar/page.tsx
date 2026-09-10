import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { STATUS_LABEL } from "../TaskCard";
import { CalendarGrid, type DayEntry } from "./CalendarGrid";

export const dynamic = "force-dynamic";

function dateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

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
  const monthEnd = new Date(Date.UTC(year, monthIndex + 1, 1)); // exclusive
  // don't project counts onto days that haven't happened yet
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const rangeEnd = monthEnd < today ? monthEnd : new Date(today.getTime() + 86400000);

  // A task counts on a given day if it was actually sitting in the
  // dashboard that day: created on or before that day, and not yet
  // delivered — the moment a task is marked delivered it drops off the
  // live board, so it stops counting from that day on (see page.tsx's
  // ACTIVE_STATUSES cutoff for the live-board equivalent of this rule).
  const tasks = await prisma.task.findMany({
    where: { project: { client: { status: "current" } }, createdAt: { lt: rangeEnd } },
    include: { assignedTo: true, project: { include: { client: true } } },
  });

  const days: Record<string, DayEntry[]> = {};
  for (let d = new Date(monthStart); d < rangeEnd; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = dateKey(d);
    for (const task of tasks) {
      if (dateKey(task.createdAt) > key) continue; // not created yet as of this day
      if (task.status === "delivered_and_uploaded" && dateKey(task.updatedAt) <= key) continue; // already delivered by this day
      (days[key] ??= []).push({
        taskId: task.id,
        title: task.title,
        clientName: task.project.client.name,
        action: STATUS_LABEL[task.status],
        actorName: task.assignedTo?.name ?? "Unassigned",
      });
    }
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
            How many tasks were sitting in the dashboard on a given day — a task stops counting the day it's
            delivered to the client, not before.
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
