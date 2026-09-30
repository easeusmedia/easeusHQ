import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { userPhotoSrc } from "@/lib/photos";
import { canEditPeople, seesEveryTeam, type Viewer } from "@/lib/scope";
import { PeopleDirectory, type PersonRecord, type TaskEntry } from "./PeopleDirectory";
import { totals, type HistoryItem } from "@/lib/history";
import { indiaDay } from "@/lib/due";
import { LIVE_TASK, LIVE_WORK_TASK } from "@/lib/workflow";
import { STAGE } from "@/lib/stages";
import { WORK_TASK_STAGE } from "@/lib/workTaskStages";
import { displayTeam } from "@/lib/teams";
import { partMax, periodFrom } from "@/lib/editorKpi";
import { loadPerformance } from "../performance/data";
import { facts } from "../performance/shared";

export const dynamic = "force-dynamic";

// Everyone at the agency: their record, what they're on now and how the
// last month went. Admin (and Abhishek) see and edit
// everyone; a core member sees their own team read-only, which is enough to
// know who's on what without handing them salaries.
// ?person=<id> opens straight on that person (linked from Finance)
export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ person?: string }> }) {
  const { person } = await searchParams;
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) redirect("/login");

  const me = await prisma.user.findUnique({
    where: { id: sessionUserId },
    select: { id: true, role: true, email: true, teamId: true },
  });
  if (!me) redirect("/login");

  const viewer: Viewer = me;
  const canEdit = canEditPeople(viewer);
  // an employee has no directory to look at — their own record is their own
  if (me.role === "employee") redirect("/board");

  const where = seesEveryTeam(viewer) ? {} : { teamId: viewer.teamId };

  const [people, teams, jobTitles, workTags] = await Promise.all([
    prisma.user.findMany({
      where,
      include: { team: true, jobTitle: true },
      orderBy: [{ employment: "asc" }, { name: "asc" }],
    }),
    prisma.team.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { members: { where: { employment: { not: "former" } } } } } } }),
    prisma.jobTitle.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    canEdit
      ? prisma.taskTag.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { tasks: true, workTasks: true } } } })
      : [],
  ]);

  // What the roster is carrying now and what it finished in the last 30
  // days, in four queries for the whole agency and grouped in memory. The
  // full record of finished work is History's job, not this page's.
  const ids = people.map((p) => p.id);
  // eslint-disable-next-line react-hooks/purity -- a server render: "now" is the moment of this request
  const since = new Date(Date.now() - 30 * 86_400_000);
  const today = indiaDay(new Date());
  const [openWorkRows, openClientRows, finishedWork, deliveredClient] = await Promise.all([
    prisma.workTask.findMany({
      where: { assignedToId: { in: ids }, ...LIVE_WORK_TASK },
      include: { tags: true, project: { include: { client: true } } },
      orderBy: [{ dueDate: "asc" }, { sortOrder: "asc" }],
    }),
    prisma.task.findMany({
      where: { assignedToId: { in: ids }, ...LIVE_TASK },
      include: { project: { include: { client: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.workTask.findMany({
      where: { assignedToId: { in: ids }, status: "done", OR: [{ completedAt: { gte: since } }, { completedAt: null, updatedAt: { gte: since } }] },
      select: { assignedToId: true, createdAt: true, completedAt: true, updatedAt: true, dueDate: true },
    }),
    prisma.task.findMany({
      where: { assignedToId: { in: ids }, status: "delivered_and_uploaded", updatedAt: { gte: since } },
      select: { assignedToId: true, createdAt: true, updatedAt: true, dueDate: true, handedOffAt: true, revisionCount: true },
    }),
  ]);

  const dueOf = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

  // editors are read by the numbers on their Performance page, this week
  const week = periodFrom({}, today);
  const kpiData = await loadPerformance({ from: week.from });
  const editorKpiFor = (id: string) => {
    if (!kpiData.editors.some((e) => e.id === id)) return null;
    const k = kpiData.score(week.from, week.to, id);
    const max = partMax(kpiData.scoring);
    const f = facts(k);
    return {
      total: k.total,
      grade: k.grade,
      parts: (["quantity", "quality", "feedback"] as const).map((part) => ({ part, value: k[part], max: max[part], fact: f[part] })),
    };
  };

  // What's in flight right now — the first question this page answers.
  const currentFor = (id: string): TaskEntry[] => [
    ...openClientRows
      .filter((t) => t.assignedToId === id)
      .map((t) => ({
        id: t.id,
        title: t.title,
        kind: "client" as const,
        status: STAGE[t.status].label,
        pill: STAGE[t.status].pill,
        client: t.project.client.name,
        project: t.project.name || t.project.type,
        tags: [] as string[],
        due: dueOf(t.dueDate),
      })),
    ...openWorkRows
      .filter((t) => t.assignedToId === id)
      .map((t) => ({
        id: t.id,
        title: t.title,
        kind: "work" as const,
        status: WORK_TASK_STAGE[t.status].label,
        pill: WORK_TASK_STAGE[t.status].pill,
        client: t.project?.client.name ?? null,
        project: t.project ? t.project.name || t.project.type : null,
        tags: t.tags.map((x) => x.name),
        due: dueOf(t.dueDate),
      })),
  ];

  // the last 30 days, scored the way History scores them (lib/history.ts)
  const performanceFor = (id: string) => {
    const base = { id, kind: "client" as const, title: "", personId: id, person: "", team: null, client: null, project: null, tags: [], startedAt: null };
    const items: HistoryItem[] = [
      ...deliveredClient
        .filter((t) => t.assignedToId === id)
        .map((t) => ({ ...base, createdAt: t.createdAt, completedAt: t.updatedAt, dueDate: t.dueDate, handedOffAt: t.handedOffAt, revisions: t.revisionCount })),
      ...finishedWork
        .filter((t) => t.assignedToId === id)
        .map((t) => ({ ...base, kind: "internal" as const, createdAt: t.createdAt, completedAt: t.completedAt ?? t.updatedAt, dueDate: t.dueDate, handedOffAt: null, revisions: 0 })),
    ];
    const { completed, onTimePct, medianTurnaround, revisionsPerTask } = totals(items);
    return { completed, onTimePct, medianTurnaround, revisionsPerTask };
  };

  const records: PersonRecord[] = people.map((p) => ({
    id: p.id,
    name: p.name,
    email: p.email,
    phone: p.phone,
    avatarUrl: userPhotoSrc(p),
    role: p.role,
    employment: p.employment,
    employmentType: p.employmentType,
    teamId: p.teamId,
    // shown under Editors / Operations / … as the rest of the app shows them
    teamName: displayTeam(p)?.name ?? null,
    // the department itself: Operations for an editor, none for an admin
    // who spans the company
    departmentName: p.team?.name ?? null,
    shownTeam: displayTeam(p)?.slug ?? null,
    jobTitleId: p.jobTitleId,
    jobTitleName: p.jobTitle?.name ?? null,
    joinedAt: dueOf(p.joinedAt),
    birthday: dueOf(p.birthday),
    emergencyContact: p.emergencyContact,
    // Decimal doesn't survive the trip to a client component, and this is
    // the one page allowed to show it at all — so it crosses as a string,
    // and only when the viewer may edit people.
    salary: canEdit && p.salary ? p.salary.toString() : null,
    notes: p.notes,
    current: currentFor(p.id),
    overdue: currentFor(p.id).filter((t) => t.due && t.due < today).length,
    performance: performanceFor(p.id),
    editorKpi: editorKpiFor(p.id),
  }));

  return (
    <div className="h-full">
      <PeopleDirectory
        people={records}
        teams={teams.map((t) => ({ id: t.id, name: t.name, slug: t.slug, people: t._count.members }))}
        jobTitles={jobTitles.map((j) => ({ id: j.id, name: j.name, teamId: j.teamId, people: people.filter((p) => p.jobTitleId === j.id && p.employment !== "former").length }))}
        workTags={workTags.map((t) => ({ id: t.id, name: t.name, teamId: t.teamId, uses: t._count.tasks + t._count.workTasks }))}
        canEdit={canEdit}
        meId={me.id}
        openFirst={person}
      />
    </div>
  );
}
