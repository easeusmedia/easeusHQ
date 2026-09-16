import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { canEditPeople, seesEveryTeam, type Viewer } from "@/lib/scope";
import { PeopleDirectory, type HistoryEntry, type PersonRecord, type TaskEntry } from "./PeopleDirectory";
import { ACTIVE_STATUSES } from "@/lib/workflow";
import { STAGE } from "@/lib/stages";
import { WORK_TASK_STAGE } from "@/lib/workTaskStages";

export const dynamic = "force-dynamic";

// Everyone at the agency, their record, and what they've actually shipped.
//
// Replaces the old four-column role table. Admin (and Abhishek) see and edit
// everyone; a core member sees their own team read-only, which is enough to
// know who's on what without handing them salaries.
export default async function PeoplePage() {
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

  const [people, teams, jobTitles] = await Promise.all([
    prisma.user.findMany({
      where,
      include: { team: true, jobTitle: true },
      orderBy: [{ employment: "asc" }, { name: "asc" }],
    }),
    prisma.team.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.jobTitle.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);

  // Everything the roster is carrying and everything it has finished, in four
  // queries for the whole agency and grouped in memory — far cheaper than a
  // round trip per person as you click down the list.
  const ids = people.map((p) => p.id);
  const [openWorkRows, openClientRows, finishedWork, deliveredClient] = await Promise.all([
    prisma.workTask.findMany({
      where: { assignedToId: { in: ids }, status: { not: "done" } },
      include: { tags: true, project: { include: { client: true } } },
      orderBy: [{ dueDate: "asc" }, { sortOrder: "asc" }],
    }),
    prisma.task.findMany({
      where: { assignedToId: { in: ids }, status: { in: ACTIVE_STATUSES } },
      include: { project: { include: { client: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.workTask.findMany({
      where: { assignedToId: { in: ids }, status: "done" },
      include: { tags: true, project: { include: { client: true } } },
      orderBy: [{ completedAt: "desc" }, { updatedAt: "desc" }],
      take: 400,
    }),
    prisma.task.findMany({
      where: { assignedToId: { in: ids }, status: "delivered_and_uploaded" },
      include: { project: { include: { client: true } } },
      orderBy: { updatedAt: "desc" },
      take: 400,
    }),
  ]);

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
        context: t.project.client.name,
        tags: [] as string[],
        due: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
      })),
    ...openWorkRows
      .filter((t) => t.assignedToId === id)
      .map((t) => ({
        id: t.id,
        title: t.title,
        kind: "work" as const,
        status: WORK_TASK_STAGE[t.status].label,
        pill: WORK_TASK_STAGE[t.status].pill,
        context: t.project ? `${t.project.client.name} · ${t.project.name || t.project.type}` : null,
        tags: t.tags.map((x) => x.name),
        due: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
      })),
  ];

  const historyFor = (id: string): HistoryEntry[] =>
    [
      ...finishedWork
        .filter((t) => t.assignedToId === id)
        .map((t) => ({
          id: t.id,
          title: t.title,
          kind: "work" as const,
          at: (t.completedAt ?? t.updatedAt).toISOString(),
          context: t.project ? `${t.project.client.name} · ${t.project.name || t.project.type}` : null,
          tags: t.tags.map((x) => x.name),
        })),
      ...deliveredClient
        .filter((t) => t.assignedToId === id)
        .map((t) => ({
          id: t.id,
          title: t.title,
          kind: "client" as const,
          at: t.updatedAt.toISOString(),
          context: t.project.client.name,
          tags: [],
        })),
    ].sort((a, b) => b.at.localeCompare(a.at));

  const records: PersonRecord[] = people.map((p) => ({
    id: p.id,
    name: p.name,
    email: p.email,
    phone: p.phone,
    avatarUrl: p.avatarUrl,
    role: p.role,
    employment: p.employment,
    teamId: p.teamId,
    teamName: p.team?.name ?? null,
    jobTitleId: p.jobTitleId,
    jobTitleName: p.jobTitle?.name ?? null,
    joinedAt: p.joinedAt ? p.joinedAt.toISOString().slice(0, 10) : null,
    // Decimal doesn't survive the trip to a client component, and this is
    // the one page allowed to show it at all — so it crosses as a string,
    // and only when the viewer may edit people.
    salary: canEdit && p.salary ? p.salary.toString() : null,
    notes: p.notes,
    openWork: openWorkRows.filter((t) => t.assignedToId === p.id).length,
    doneWork: finishedWork.filter((t) => t.assignedToId === p.id).length,
    clientLoad: openClientRows.filter((t) => t.assignedToId === p.id).length,
    current: currentFor(p.id),
    history: historyFor(p.id),
  }));

  return (
    <div className="h-full">
      <PeopleDirectory
        people={records}
        teams={teams.map((t) => ({ id: t.id, name: t.name, slug: t.slug }))}
        jobTitles={jobTitles.map((j) => ({ id: j.id, name: j.name }))}
        canEdit={canEdit}
        meId={me.id}
      />
    </div>
  );
}
