import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { isFounder, worksTheBoard } from "@/lib/scope";
import { LIVE_TASK, LIVE_WORK_TASK } from "@/lib/workflow";
import { STAGE, stageLabel, stageMeaning } from "@/lib/stages";
import { WORK_TASK_STAGE } from "@/lib/workTaskStages";
import { addDays, dayOf, daysBetween, mondayOf, shortDay } from "@/lib/editorKpi";
import { DRIVE_SETTINGS } from "@/lib/drive";
import { calendarAccount, listMeetings, type Meeting } from "@/lib/googleCalendar";
import { money } from "../finance/data";
import { loadWork } from "../workData";
import { HomeView, type HomeItem, type Notice } from "./HomeView";

export const dynamic = "force-dynamic";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// Level 1's view of everything at once: their own tasks, the week's
// meetings, the work in motion (by client, department or person) and the
// notices worth their attention. ?week= moves the calendar.
export default async function HomePage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!isFounder(viewer)) redirect(worksTheBoard(viewer) ? "/board" : "/my-tasks");

  const { week } = await searchParams;
  const now = new Date();
  const today = dayOf(now);
  const monday = mondayOf(/^\d{4}-\d{2}-\d{2}$/.test(week ?? "") ? week! : today);

  const project = { select: { name: true, type: true, client: { select: { name: true, slug: true } } } };
  const [tasks, workTasks, people, account, googleApp, invoices, billing, contracts, messages, notes, mine] = await Promise.all([
    prisma.task.findMany({
      where: LIVE_TASK,
      select: { id: true, title: true, status: true, workflow: true, dueDate: true, deliveryDate: true, sortOrder: true, assignedTo: { select: { id: true, name: true } }, team: { select: { name: true } }, project },
    }),
    prisma.workTask.findMany({
      where: LIVE_WORK_TASK,
      select: { id: true, title: true, status: true, dueDate: true, sortOrder: true, assignedTo: { select: { id: true, name: true } }, team: { select: { name: true } }, project },
    }),
    prisma.user.findMany({ where: { employment: "active" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    calendarAccount(),
    prisma.appSetting.findUnique({ where: { key: DRIVE_SETTINGS.clientId } }),
    // what's owed to us and not yet paid
    prisma.invoice.findMany({ where: { status: { in: ["ready", "sent", "overdue"] } }, select: { id: true, number: true, amount: true, currency: true, status: true, dueDate: true, client: { select: { name: true } } } }),
    // who's due a new invoice, by their billing cycle
    prisma.client.findMany({
      where: { status: "current", billingCadence: { not: null } },
      select: { id: true, name: true, slug: true, billingCadence: true, billingDayOfMonth: true, billingMilestoneCount: true, lastInvoicedAt: true, invoices: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 } },
    }),
    prisma.contract.count({ where: { status: "draft" } }),
    prisma.clientFeedback.count({ where: { readAt: null } }),
    prisma.notice.findMany({ orderBy: { createdAt: "desc" } }),
    // for Add task: projects, and who work can go to
    loadWork(viewer, "mine", { withQueue: false }),
  ]);

  // the week's meetings, when the calendar is connected
  let meetings: Meeting[] = [];
  let calendarError: string | null = null;
  if (account !== null) {
    try {
      meetings = await listMeetings(new Date(`${monday}T00:00:00+05:30`), new Date(`${addDays(monday, 7)}T00:00:00+05:30`));
    } catch (err) {
      const why = err instanceof Error ? err.message : "";
      // Google's own wording names project numbers and console links; say what it means
      calendarError = /has not been used|is disabled/i.test(why)
        ? "Google Calendar is switched off for the app's Google project. Turn on the Google Calendar API in Google Cloud, then reload."
        : /invalid_grant|refresh/i.test(why)
          ? "The Google Calendar connection has expired. Connect it again from Integrations."
          : "Google Calendar didn't answer. Try again in a minute.";
    }
  }

  const work: HomeItem[] = [
    ...tasks.map((t) => ({
      key: `t${t.id}`,
      id: t.id,
      source: "task" as const,
      workflow: t.workflow,
      sortOrder: t.sortOrder,
      title: t.title,
      status: stageLabel(t.status, t.workflow),
      meaning: stageMeaning(t.status, t.workflow),
      pill: STAGE[t.status].pill,
      due: t.dueDate ? dayOf(t.dueDate) : null,
      delivery: t.deliveryDate ? dayOf(t.deliveryDate) : null,
      client: t.project.client.name,
      href: `/clients/${t.project.client.slug}`,
      department: t.team?.name ?? null,
      person: t.assignedTo,
    })),
    ...workTasks.map((t) => ({
      key: `w${t.id}`,
      id: t.id,
      source: "work" as const,
      workflow: "todo",
      sortOrder: t.sortOrder,
      title: t.title,
      status: WORK_TASK_STAGE[t.status].label,
      meaning: WORK_TASK_STAGE[t.status].meaning,
      pill: WORK_TASK_STAGE[t.status].pill,
      due: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
      delivery: null,
      client: t.project?.client.name ?? null,
      href: t.project ? `/clients/${t.project.client.slug}` : null,
      department: t.team?.name ?? null,
      person: t.assignedTo,
    })),
  ];

  // Notices: what the app knows needs Level 1, then what they've written
  const milestone = await Promise.all(
    billing
      .filter((c) => c.billingCadence === "milestone" && c.billingMilestoneCount)
      .map(async (c) => ({
        c,
        delivered: await prisma.task.count({ where: { status: "delivered_and_uploaded", project: { clientId: c.id }, updatedAt: { gt: c.lastInvoicedAt ?? new Date(0) } } }),
      }))
  );
  const notices: Notice[] = [
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
      .map(({ c, delivered }) => ({
        key: `m${c.id}`,
        kind: "invoice" as const,
        tone: "amber" as const,
        text: `${c.name} is ready to bill: ${plural(delivered, "deliverable")} since the last invoice`,
        href: `/clients/${c.slug}?tab=billing`,
      })),
    ...billing
      .filter((c) => c.billingCadence === "monthly_date" && c.billingDayOfMonth && Number(today.slice(8, 10)) >= Math.min(c.billingDayOfMonth, 28) && (c.invoices[0] ? dayOf(c.invoices[0].createdAt).slice(0, 7) < today.slice(0, 7) : true))
      .map((c) => ({ key: `b${c.id}`, kind: "invoice" as const, tone: "amber" as const, text: `${c.name} is due this month's invoice`, href: `/clients/${c.slug}?tab=billing` })),
    ...(contracts ? [{ key: "contracts", kind: "contract" as const, tone: "accent" as const, text: `${plural(contracts, "contract")} waiting for terms`, href: "/contracts" }] : []),
    ...(messages ? [{ key: "messages", kind: "message" as const, tone: "accent" as const, text: `${plural(messages, "new message")} from clients`, href: "/clients" }] : []),
    ...notes.map((n) => ({ key: n.id, id: n.id, kind: "note" as const, tone: "neutral" as const, text: n.body, sub: [n.by, shortDay(dayOf(n.createdAt))].filter(Boolean).join(" · ") })),
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
      work={work}
      notices={notices}
      meetings={meetings}
      calendar={{ connected: account !== null, error: calendarError, clientId: googleApp?.value ?? "" }}
      people={people}
      composer={{ projects: mine.projects, assignees: mine.assignable }}
    />
  );
}
