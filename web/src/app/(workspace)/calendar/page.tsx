import Link from "next/link";
import { CalendarDays, ChartGantt, ChevronLeft, ChevronRight } from "lucide-react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { assignOptionsFor, getAllUsers } from "@/lib/users";
import { assigneeWhere, effectiveRole, runsClients, visibleTagWhere, type Viewer } from "@/lib/scope";
import { getViewer } from "@/lib/viewer";
import type { Role } from "@/lib/workflow";
import { PUBLIC_USER_SELECT } from "@/lib/publicUser";
import { ACTIVE_STATUSES } from "@/lib/workflow";
import { deliveredAt } from "@/lib/delivered";
import { indiaDay } from "@/lib/due";
import { addDays, mondayOf, spanOf, stretchOpen } from "@/lib/timeline";
import { CalendarGrid, type DayEntry } from "./CalendarGrid";
import { CalendarTimeline, type TimelineTask } from "./CalendarTimeline";

export const dynamic = "force-dynamic";

function dateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; view?: string; week?: string }>;
}) {
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) redirect("/login");

  const { month: monthParam, view, week } = await searchParams;
  if (view === "timeline") return <TimelinePage sessionUserId={sessionUserId} week={week} />;
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
  const viewer = await getViewer();
  if (!viewer || viewer.role === "employee") redirect("/board"); // Founders and Leads only — a management view
  const [users, tasks, projects, allTags] = await Promise.all([
    getAllUsers(),
    // A task counts on a given day if it was actually sitting in the
    // dashboard that day: created on or before that day, and not yet
    // delivered — the moment a task is marked delivered it drops off the
    // live board, so it stops counting from that day on (see page.tsx's
    // ACTIVE_STATUSES cutoff for the live-board equivalent of this rule).
    prisma.task.findMany({
      where: { AND: [{ project: { client: { status: "current" } }, createdAt: { lt: rangeEnd }, ...ON_STAFF }, assigneeWhere(viewer)] },
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
  if (!me) redirect("/board");
  const env = envFor(viewer, users, projects, allTags);

  // what goes live on the clients' channels, each day: Client success's to see
  const postings: Record<string, DayEntry[]> = {};
  if (runsClients(viewer)) {
    for (const t of tasks) {
      if (!t.postDate || t.postDate < monthStart || t.postDate >= monthEnd) continue;
      (postings[dateKey(t.postDate)] ??= []).push({
        taskId: t.id,
        title: t.title,
        clientName: t.project.client.name,
        status: t.status,
        actorName: t.assignedTo?.name ?? "Unassigned",
      });
    }
  }

  const delivered = await deliveredDays(tasks);
  const days: Record<string, DayEntry[]> = {};
  for (let d = new Date(monthStart); d < rangeEnd; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = dateKey(d);
    for (const task of tasks) {
      if (dateKey(task.createdAt) > key) continue; // not created yet as of this day
      const gone = delivered.get(task.id);
      if (gone && gone <= key) continue; // already delivered by this day
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
      <ViewSwitch view="month" />
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

      <CalendarGrid year={year} month={monthIndex} days={days} postings={postings} tasks={tasks} env={env} />
    </>
  );
}

type Users = Awaited<ReturnType<typeof getAllUsers>>;

// Only work that's anyone's now: tasks of people who've left aren't counted
const ON_STAFF = { AND: [{ OR: [{ assignedToId: null }, { assignedTo: { employment: { not: "former" as const } } }] }] };

// The day each delivered task left the board (lib/delivered). One with no
// move recorded arrived from Notion already done: it was never open on the
// board, so it leaves the day it was made.
async function deliveredDays(tasks: { id: string; status: string; createdAt: Date }[]): Promise<Map<string, string>> {
  const done = tasks.filter((t) => t.status === "delivered_and_uploaded");
  const at = await deliveredAt(done.map((t) => t.id));
  return new Map(done.map((t) => [t.id, dateKey(at.get(t.id) ?? t.createdAt)]));
}

// what a task's own window needs, the same as the Board passes it
function envFor(
  me: Viewer,
  users: Users,
  projects: { id: string; name: string; type: string; client: { id: string; name: string } }[],
  allTags: { id: string; name: string; clientFacing: boolean; teamId: string | null; team: { name: string } | null }[]
) {
  const visible = visibleTagWhere(me) as { OR?: { teamId: string | null }[] };
  return {
    editors: assignOptionsFor(me, users).map((u) => ({ id: u.id, name: u.name })),
    projects: projects.map((p) => ({ id: p.id, name: p.name || p.type, client: p.client })),
    actingUserId: me.id,
    actingRole: effectiveRole(me) as Role,
    // the same kinds of work this person picks from on the Board
    taskTags: (visible.OR ? allTags.filter((t) => !t.teamId || t.teamId === me.teamId) : allTags).map((t) => ({
      id: t.id,
      name: t.name,
      clientFacing: t.clientFacing,
      group: t.team?.name ?? null,
    })),
  };
}

// Month or timeline, the same switch as the Board's Board and List
function ViewSwitch({ view }: { view: "month" | "timeline" }) {
  return (
    <div className="mb-5 flex w-fit gap-1 rounded-xl panel-soft p-1">
      {(
        [
          ["month", CalendarDays, "Month", "/calendar"],
          ["timeline", ChartGantt, "Timeline", "/calendar?view=timeline"],
        ] as const
      ).map(([key, Icon, label, href]) => (
        <Link
          key={key}
          href={href}
          className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium ${
            view === key ? "selected" : "border border-transparent text-muted hover:text-foreground"
          }`}
        >
          <Icon size={15} /> {label}
        </Link>
      ))}
    </div>
  );
}

const day = (d: Date | null) => (d ? indiaDay(d) : null);
const shortDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

// A week of the team's client work as a timeline (CalendarTimeline): what's
// open, and what was delivered, from the day it starts to the day it's due.
async function TimelinePage({ sessionUserId, week }: { sessionUserId: string; week?: string }) {
  const today = indiaDay(new Date());
  const weekStart = mondayOf(/^\d{4}-\d{2}-\d{2}$/.test(week ?? "") ? week! : today);
  const weekEnd = addDays(weekStart, 6);

  const viewer = await getViewer();
  if (!viewer || viewer.role === "employee") redirect("/board"); // Founders and Leads only — a management view
  const [users, tasks, projects, allTags] = await Promise.all([
    getAllUsers(),
    // what's open, and what was finished since the week began
    prisma.task.findMany({
      where: {
        AND: [
          {
            project: { client: { status: "current" } },
            OR: [{ status: { in: ACTIVE_STATUSES } }, { updatedAt: { gte: new Date(`${weekStart}T00:00:00+05:30`) } }],
            ...ON_STAFF,
          },
          assigneeWhere(viewer),
        ],
      },
      include: { assignedTo: { select: PUBLIC_USER_SELECT }, tags: true, project: { include: { client: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.project.findMany({
      where: { client: { status: "current" } },
      include: { client: { select: { id: true, name: true } } },
      orderBy: [{ client: { name: "asc" } }, { createdAt: "desc" }],
    }),
    prisma.taskTag.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { team: { select: { name: true } } } }),
  ]);
  const me = users.find((u) => u.id === sessionUserId);
  if (!me || me.role === "employee") redirect("/board"); // admin/core only — a management view

  const delivered = await deliveredDays(tasks);
  const items: TimelineTask[] = tasks
    // delivered work shows only for the week it was delivered in, and only
    // if it was ever open on the board (lib: deliveredDays)
    .filter((t) => t.status !== "delivered_and_uploaded" || (delivered.get(t.id) ?? "") >= weekStart)
    .map((t) => {
      const due = day(t.dueDate);
      const span = spanOf({ start: day(t.startDate), created: indiaDay(t.createdAt), due, delivery: day(t.deliveryDate) });
      const open = t.status !== "delivered_and_uploaded";
      return {
        id: t.id,
        title: t.title,
        client: t.project.client.name,
        status: t.status,
        assignee: t.assignedTo?.name ?? null,
        tag: t.tags[0]?.name ?? null,
        ...(open ? stretchOpen(span, due, today) : { ...span, overdue: false }),
      };
    })
    .filter((t) => t.start <= weekEnd && t.end >= weekStart);

  const open = items.filter((t) => t.status !== "delivered_and_uploaded").length;
  const arrow = "flex size-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground";
  const href = (d: string) => `/calendar?view=timeline&week=${d}`;

  return (
    <>
      <ViewSwitch view="timeline" />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {shortDay(weekStart)} – {shortDay(weekEnd)}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {open} task{open === 1 ? "" : "s"} in progress this week
            {items.length > open && `, ${items.length - open} delivered`}. Each runs from the day it starts to the day it&apos;s due.
          </p>
        </div>
        <div className="flex items-center gap-1">
          {weekStart !== mondayOf(today) && (
            <Link href="/calendar?view=timeline" className="btn btn-sm btn-ghost mr-1">
              Today
            </Link>
          )}
          <Link href={href(addDays(weekStart, -7))} aria-label="Previous week" className={arrow}>
            <ChevronLeft size={16} />
          </Link>
          <Link href={href(addDays(weekStart, 7))} aria-label="Next week" className={arrow}>
            <ChevronRight size={16} />
          </Link>
        </div>
      </div>
      <CalendarTimeline weekStart={weekStart} today={today} items={items} tasks={tasks} env={envFor(viewer, users, projects, allTags)} />
    </>
  );
}
