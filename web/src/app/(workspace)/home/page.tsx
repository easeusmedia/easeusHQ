import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { isFounder, worksTheBoard } from "@/lib/scope";
import { LIVE_TASK, LIVE_WORK_TASK } from "@/lib/workflow";
import { STAGE, stageLabel } from "@/lib/stages";
import { WORK_TASK_STAGE } from "@/lib/workTaskStages";
import { addDays, dayOf, mondayOf } from "@/lib/editorKpi";
import { calendarAccount, listMeetings, type Meeting } from "@/lib/googleCalendar";
import { HomeView, type HomeItem } from "./HomeView";

export const dynamic = "force-dynamic";

// A Founder's view of everything at once: the work in motion (by client,
// department or person), the week's meetings from Google Calendar, what's
// late or due today, and their own tasks. ?week= moves the calendar.
export default async function HomePage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!isFounder(viewer)) redirect(worksTheBoard(viewer) ? "/board" : "/my-tasks");

  const { week } = await searchParams;
  const now = new Date();
  const today = dayOf(now);
  const monday = mondayOf(/^\d{4}-\d{2}-\d{2}$/.test(week ?? "") ? week! : today);

  const project = { select: { name: true, type: true, client: { select: { name: true, slug: true } } } };
  const [tasks, workTasks, people, account] = await Promise.all([
    prisma.task.findMany({
      where: LIVE_TASK,
      select: { id: true, title: true, status: true, workflow: true, dueDate: true, deliveryDate: true, assignedTo: { select: { id: true, name: true } }, team: { select: { name: true } }, project },
    }),
    prisma.workTask.findMany({
      where: LIVE_WORK_TASK,
      select: { id: true, title: true, status: true, dueDate: true, assignedTo: { select: { id: true, name: true } }, team: { select: { name: true } }, project },
    }),
    prisma.user.findMany({ where: { employment: "active" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    calendarAccount(),
  ]);

  // the week's meetings, when the calendar is connected
  let meetings: Meeting[] = [];
  let calendarError: string | null = null;
  if (account !== null) {
    try {
      meetings = await listMeetings(new Date(`${monday}T00:00:00+05:30`), new Date(`${addDays(monday, 7)}T00:00:00+05:30`));
    } catch (err) {
      calendarError = err instanceof Error ? err.message : "Google Calendar didn't answer.";
    }
  }

  const work: HomeItem[] = [
    ...tasks.map((t) => ({
      key: `t${t.id}`,
      title: t.title,
      status: stageLabel(t.status, t.workflow),
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
      title: t.title,
      status: WORK_TASK_STAGE[t.status].label,
      pill: WORK_TASK_STAGE[t.status].pill,
      due: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
      delivery: null,
      client: t.project?.client.name ?? null,
      href: t.project ? `/clients/${t.project.client.slug}` : null,
      department: t.team?.name ?? null,
      person: t.assignedTo,
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
      work={work}
      meetings={meetings}
      calendar={{ connected: account !== null, error: calendarError }}
      people={people}
    />
  );
}
