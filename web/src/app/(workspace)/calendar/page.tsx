import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { assignOptionsFor, getAllUsers } from "@/lib/users";
import { visibleTagWhere } from "@/lib/scope";
import type { Role } from "@/lib/workflow";
import { PUBLIC_USER_SELECT } from "@/lib/publicUser";
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
  const [users, tasks, projects, allTags] = await Promise.all([
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
    // for a task's own window: the projects it can move to, the tags on offer
    prisma.project.findMany({
      where: { client: { status: "current" } },
      include: { client: { select: { id: true, name: true } } },
      orderBy: [{ client: { name: "asc" } }, { createdAt: "desc" }],
    }),
    prisma.taskTag.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { team: { select: { name: true } } } }),
  ]);
  const me = users.find((u) => u.id === sessionUserId);
  if (!me || me.role === "employee") redirect("/board"); // admin/core only — a management view
  const visible = visibleTagWhere(me) as { OR?: { teamId: string | null }[] };
  const env = {
    editors: assignOptionsFor(me, users).map((u) => ({ id: u.id, name: u.name })),
    projects: projects.map((p) => ({ id: p.id, name: p.name || p.type, client: p.client })),
    actingUserId: me.id,
    actingRole: me.role as Role,
    // the same kinds of work this person picks from on the Board
    taskTags: (visible.OR ? allTags.filter((t) => !t.teamId || t.teamId === me.teamId) : allTags).map((t) => ({
      id: t.id,
      name: t.name,
      clientFacing: t.clientFacing,
      group: t.team?.name ?? null,
    })),
  };

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
        status: task.status,
        actorName: task.assignedTo?.name ?? "Unassigned",
      });
    }
  }

  const monthLabel = monthStart.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const prev = new Date(Date.UTC(year, monthIndex - 1, 1));
  const next = new Date(Date.UTC(year, monthIndex + 1, 1));
  const toParam = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

  const todayParam = toParam(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
  const onThisMonth = toParam(monthStart) === todayParam;
  const arrow = "flex size-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground";

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{monthLabel}</h1>
          <p className="mt-1 text-sm text-muted">
            The open tasks the team carried each day. A task counts until the day it&apos;s delivered to the client.
          </p>
        </div>
        <div className="flex items-center gap-1">
          {!onThisMonth && (
            <Link href={`/calendar?month=${todayParam}`} className="btn btn-sm btn-ghost mr-1">
              Today
            </Link>
          )}
          <Link href={`/calendar?month=${toParam(prev)}`} aria-label="Previous month" className={arrow}>
            <ChevronLeft size={16} />
          </Link>
          <Link href={`/calendar?month=${toParam(next)}`} aria-label="Next month" className={arrow}>
            <ChevronRight size={16} />
          </Link>
        </div>
      </div>

      <CalendarGrid year={year} month={monthIndex} days={days} tasks={tasks} env={env} />
    </>
  );
}
