import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { getAllUsers } from "@/lib/users";
import { STAGE } from "@/lib/stages";
import { PUBLIC_USER_SELECT } from "@/lib/publicUser";
import { CalendarGrid, type DayEntry } from "./CalendarGrid";
import { PageHeader } from "../PageHeader";
import { ChevronLeft, ChevronRight } from "lucide-react";

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

  const { month: monthParam } = await searchParams;
  const now = new Date();
  const parsed = monthParam?.match(/^(\d{4})-(\d{1,2})$/);
  const [year, month] =
    parsed && Number(parsed[2]) >= 1 && Number(parsed[2]) <= 12
      ? [Number(parsed[1]), Number(parsed[2])]
      : [now.getUTCFullYear(), now.getUTCMonth() + 1]; // malformed/garbage ?month= falls back to the current month
  const monthIndex = month - 1; // 0-indexed for Date.UTC

  const monthStart = new Date(Date.UTC(year, monthIndex, 1));
  const monthEnd = new Date(Date.UTC(year, monthIndex + 1, 1)); // exclusive
  // don't project counts onto days that haven't happened yet
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const rangeEnd = monthEnd < today ? monthEnd : new Date(today.getTime() + 86400000);

  // users + tasks run together instead of waiting on the role check first
  // (a wasted task query for the rare employee who lands here directly is
  // cheaper than a second sequential round trip for every real visit)
  const [users, tasks] = await Promise.all([
    getAllUsers(),
    // A task counts on a given day if it was actually sitting in the
    // dashboard that day: created on or before that day, and not yet
    // delivered — the moment a task is marked delivered it drops off the
    // live board, so it stops counting from that day on (see page.tsx's
    // ACTIVE_STATUSES cutoff for the live-board equivalent of this rule).
    prisma.task.findMany({
      where: { project: { client: { status: "current" } }, createdAt: { lt: rangeEnd } },
      include: { assignedTo: { select: PUBLIC_USER_SELECT }, tags: true, project: { include: { client: true } } },
    }),
  ]);
  const me = users.find((u) => u.id === sessionUserId);
  if (me?.role === "employee") redirect("/board"); // admin/core only — a management view

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
        action: STAGE[task.status].label,
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
      <PageHeader
        title="Calendar"
        description="How much work was open on each day. A task counts from the day it's added until the day it's delivered."
        actions={
          <div className="segmented items-center">
            <Link
              href={`/calendar?month=${toParam(prev)}`}
              aria-label="Previous month"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-foreground/[0.06] hover:text-foreground"
            >
              <ChevronLeft size={15} />
            </Link>
            <span className="min-w-28 text-center text-sm font-medium">{monthLabel}</span>
            <Link
              href={`/calendar?month=${toParam(next)}`}
              aria-label="Next month"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-foreground/[0.06] hover:text-foreground"
            >
              <ChevronRight size={15} />
            </Link>
          </div>
        }
      />

      <CalendarGrid year={year} month={monthIndex} days={days} />
    </>
  );
}
