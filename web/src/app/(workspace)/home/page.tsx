import { redirect } from "next/navigation";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { getRealUserId } from "@/lib/auth";
import { getAllUsers, assignOptionsFor } from "@/lib/users";
import { assigneeWhere, effectiveRole, isFounder, isLead, isMember } from "@/lib/scope";
import { LIVE_TASK } from "@/lib/workflow";
import { STAGE, stageLabel, stageMeaning } from "@/lib/stages";
import { WORK_TASK_STAGE } from "@/lib/workTaskStages";
import { addDays, dayOf, daysBetween, mondayOf, shortDay } from "@/lib/editorKpi";
import { DRIVE_SETTINGS } from "@/lib/drive";
import { calendarAccount, listMeetings, type Meeting } from "@/lib/googleCalendar";
import { sweepIfDue } from "@/lib/taskTrack";
import { PUBLIC_CLIENT_SELECT, PUBLIC_USER_SELECT } from "@/lib/publicUser";
import { money } from "../finance/data";
import { loadWork } from "../workData";
import { HomeView, type HomeItem, type Notice } from "./HomeView";

export const dynamic = "force-dynamic";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// Everyone's Home, as far as they may see: Level 1 the whole company,
// Level 2 their departments, Level 3 their own work. The work in motion
// down the left; their own tasks, the week's meetings and their notices on
// the right. ?week= moves the calendar.
export default async function HomePage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const full = isFounder(viewer);
  const member = isMember(viewer);
  const { week } = await searchParams;
  const now = new Date();
  const today = dayOf(now);
  const monday = mondayOf(/^\d{4}-\d{2}-\d{2}$/.test(week ?? "") ? week! : today);
  // their own work and what they've been added to; a Level 2 their departments' too
  const scope = assigneeWhere(viewer);

  // the week's meetings, when the calendar is connected; what went wrong, if it did
  const week7 = async (): Promise<{ account: string | null; meetings: Meeting[]; error: string | null }> => {
    const account = await calendarAccount();
    if (account === null) return { account, meetings: [], error: null };
    try {
      return { account, meetings: await listMeetings(new Date(`${monday}T00:00:00+05:30`), new Date(`${addDays(monday, 7)}T00:00:00+05:30`)), error: null };
    } catch (err) {
      const why = err instanceof Error ? err.message : "";
      // Google's own wording names project numbers and console links; say what it means
      const error = /has not been used|is disabled/i.test(why)
        ? "Google Calendar is switched off for the app's Google project. Turn on the Google Calendar API in Google Cloud, then reload."
        : /invalid_grant|refresh/i.test(why)
          ? "The Google Calendar connection has expired. Connect it again from Integrations."
          : "Google Calendar didn't answer. Try again in a minute.";
      return { account, meetings: [], error };
    }
  };

  // all of it side by side, Google included: nothing here waits on anything else
  const [tasks, work, users, teams, kinds, calendar, googleApp, mine, extras] = await Promise.all([
    prisma.task.findMany({
      where: { AND: [LIVE_TASK, scope] },
      include: { assignedTo: { select: PUBLIC_USER_SELECT }, tags: true, project: { include: { client: { select: PUBLIC_CLIENT_SELECT } } }, team: { select: { name: true } }, shares: { where: { userId: viewer.id }, select: { id: true } } },
      orderBy: { dueDate: "asc" },
    }),
    loadWork(viewer, member ? "mine" : "all", { withQueue: false }),
    getAllUsers(),
    prisma.team.findMany({ select: { slug: true, name: true } }),
    // Add task offers Production's kinds of work to whoever does them
    prisma.jobTitle.findMany({
      where: { holders: { some: { id: viewer.id } }, team: { slug: "production" } },
      select: { id: true, name: true, workflow: true, team: { select: { name: true } }, kinds: { select: { id: true, name: true, workflow: true, clientFacing: true } } },
    }),
    week7(),
    prisma.appSetting.findUnique({ where: { key: DRIVE_SETTINGS.clientId } }),
    // notices for this person
    prisma.notice.findMany({ where: { OR: [{ forId: viewer.id }, ...(full ? [{ forId: null }] : [])] }, orderBy: { createdAt: "desc" }, take: 40 }),
    full ? levelOneNotices(today) : [],
    // the night's overdue check, if it hasn't run today. Any notices it
    // makes arrive with the live refresh its own writes set off.
    sweepIfDue(),
  ]);

  // the notices are on screen now: seen (the number on Home clears), but
  // marked new this once. Not while Level 1 is looking as someone else.
  const fresh = new Set(mine.filter((n) => !n.readAt).map((n) => n.id));
  // Marked once the page has been sent, so it doesn't hold the page up.
  if (fresh.size && (await getRealUserId()) === viewer.id) {
    const seen = [...fresh];
    after(() => prisma.notice.updateMany({ where: { id: { in: seen } }, data: { readAt: new Date() } }).catch(() => {}));
  }

  const departmentName = new Map(teams.map((t) => [t.slug, t.name]));
  const items: HomeItem[] = [
    ...tasks.map((t) => ({
      key: `t${t.id}`,
      id: t.id,
      source: "task" as const,
      workflow: t.workflow,
      title: t.title,
      status: stageLabel(t.status, t.workflow),
      meaning: stageMeaning(t.status, t.workflow),
      pill: STAGE[t.status].pill,
      // its completion date is met once it first reaches the client
      due: t.dueDate && !t.handedOffAt ? dayOf(t.dueDate) : null,
      delivery: t.deliveryDate ? dayOf(t.deliveryDate) : null,
      client: t.project.client.name,
      department: t.team?.name ?? null,
      person: t.assignedTo,
      strikes: t.strikes,
      task: t,
    })),
    ...work.tasks.map((t) => ({
      key: `w${t.id}`,
      id: t.id,
      source: "work" as const,
      workflow: "todo",
      title: t.title,
      status: WORK_TASK_STAGE[t.status].label,
      meaning: WORK_TASK_STAGE[t.status].meaning,
      pill: WORK_TASK_STAGE[t.status].pill,
      due: t.dueDate,
      delivery: null,
      client: t.project?.client.name ?? null,
      department: t.teamSlug ? (departmentName.get(t.teamSlug) ?? null) : null,
      person: { id: t.assignedTo.id, name: t.assignedTo.name },
      strikes: t.strikes ?? 0,
      todo: t,
    })),
  ];

  const notices: Notice[] = [
    ...extras,
    ...mine.map((n) => ({
      key: n.id,
      id: n.id,
      kind: n.kind === "overdue" ? ("overdue" as const) : n.kind === "shared" ? ("shared" as const) : ("note" as const),
      tone: n.kind === "overdue" ? ("rose" as const) : n.kind === "shared" ? ("accent" as const) : ("neutral" as const),
      text: n.body,
      sub: [n.kind === "note" ? n.by : null, shortDay(dayOf(n.createdAt))].filter(Boolean).join(" · "),
      // the task it's about, to open
      open: n.taskId ? `t${n.taskId}` : n.workTaskId ? `w${n.workTaskId}` : undefined,
      fresh: fresh.has(n.id),
    })),
  ];

  // IST, where everyone is
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(now));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <HomeView
      greeting={`${greeting}, ${viewer.name.split(" ")[0]}`}
      today={today}
      monday={monday}
      meId={viewer.id}
      // a Level 3's work is all their own: no separate My tasks
      showMine={!member}
      // Level 1 and 2 schedule meetings
      canMeet={full || isLead(viewer)}
      canNote={full}
      items={items}
      notices={notices}
      meetings={calendar.meetings}
      calendar={{ connected: calendar.account !== null, error: calendar.error, clientId: googleApp?.value ?? "" }}
      people={users.filter((u) => u.employment === "active").map((u) => ({ id: u.id, name: u.name }))}
      composer={{
        projects: work.projects,
        assignees: work.assignable,
        kinds: kinds.flatMap((r) =>
          r.kinds.length
            ? r.kinds.map((k) => ({ id: k.id, name: k.name, workflow: k.workflow, clientFacing: k.clientFacing, department: r.team?.name ?? null }))
            : [{ id: `role:${r.id}`, name: r.name, workflow: r.workflow, clientFacing: false, department: r.team?.name ?? null }]
        ),
      }}
      env={{ editors: assignOptionsFor(viewer, users).map((u) => ({ id: u.id, name: u.name })), projects: work.projects, taskTags: work.taskTags, actingRole: effectiveRole(viewer), actingUserId: viewer.id }}
    />
  );
}

// What the app knows needs Level 1: invoices, clients due a bill,
// contracts waiting, client messages
async function levelOneNotices(today: string): Promise<Notice[]> {
  const [invoices, billing, contracts, messages] = await Promise.all([
    prisma.invoice.findMany({ where: { status: { in: ["ready", "sent", "overdue"] } }, select: { id: true, number: true, amount: true, currency: true, status: true, dueDate: true, client: { select: { name: true } } } }),
    prisma.client.findMany({
      where: { status: "current", billingCadence: { not: null } },
      select: { id: true, name: true, slug: true, billingCadence: true, billingDayOfMonth: true, billingMilestoneCount: true, lastInvoicedAt: true, invoices: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 } },
    }),
    prisma.contract.count({ where: { status: "draft" } }),
    prisma.clientFeedback.count({ where: { readAt: null } }),
  ]);
  const milestone = await Promise.all(
    billing
      .filter((c) => c.billingCadence === "milestone" && c.billingMilestoneCount)
      .map(async (c) => ({ c, delivered: await prisma.task.count({ where: { status: "delivered_and_uploaded", project: { clientId: c.id }, updatedAt: { gt: c.lastInvoicedAt ?? new Date(0) } } }) }))
  );
  return [
    ...invoices
      .filter((i) => i.status === "ready" || (i.dueDate && dayOf(i.dueDate) <= addDays(today, 3)))
      .map((i) => {
        const due = i.dueDate ? dayOf(i.dueDate) : null;
        const late = due ? daysBetween(due, today) : 0;
        const what = `${i.number ? `Invoice ${i.number}` : "An invoice"} for ${i.client.name}, ${money(Number(i.amount), i.currency)}`;
        return {
          key: `i${i.id}`,
          kind: "invoice" as const,
          tone: late > 0 ? ("rose" as const) : ("amber" as const),
          text: i.status === "ready" ? `${what}, is ready to send` : late > 0 ? `${what}, is ${plural(late, "day")} overdue` : `${what}, is due ${due === today ? "today" : `on ${shortDay(due!)}`}`,
          href: "/finance",
        };
      }),
    ...milestone
      .filter(({ c, delivered }) => delivered >= (c.billingMilestoneCount ?? Infinity))
      .map(({ c, delivered }) => ({ key: `m${c.id}`, kind: "invoice" as const, tone: "amber" as const, text: `${c.name} is ready to bill: ${plural(delivered, "deliverable")} since the last invoice`, href: `/clients/${c.slug}?tab=billing` })),
    ...billing
      .filter((c) => c.billingCadence === "monthly_date" && c.billingDayOfMonth && Number(today.slice(8, 10)) >= Math.min(c.billingDayOfMonth, 28) && (c.invoices[0] ? dayOf(c.invoices[0].createdAt).slice(0, 7) < today.slice(0, 7) : true))
      .map((c) => ({ key: `b${c.id}`, kind: "invoice" as const, tone: "amber" as const, text: `${c.name} is due this month's invoice`, href: `/clients/${c.slug}?tab=billing` })),
    ...(contracts ? [{ key: "contracts", kind: "contract" as const, tone: "accent" as const, text: `${plural(contracts, "contract")} waiting for terms`, href: "/contracts" }] : []),
    ...(messages ? [{ key: "messages", kind: "message" as const, tone: "accent" as const, text: `${plural(messages, "new message")} from clients`, href: "/clients" }] : []),
  ];
}
