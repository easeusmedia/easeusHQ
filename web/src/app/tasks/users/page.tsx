import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { canEditPeople, seesEveryTeam, type Viewer } from "@/lib/scope";
import { PeopleDirectory, type PersonRecord } from "./PeopleDirectory";

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
  if (me.role === "employee") redirect("/tasks");

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

  // Live load and finished work, counted per person in two grouped queries
  // rather than one per row — this list is the whole agency.
  const ids = people.map((p) => p.id);
  const [openWork, doneWork, clientLoad] = await Promise.all([
    prisma.workTask.groupBy({
      by: ["assignedToId"],
      where: { assignedToId: { in: ids }, status: { not: "done" } },
      _count: { _all: true },
    }),
    prisma.workTask.groupBy({
      by: ["assignedToId"],
      where: { assignedToId: { in: ids }, status: "done" },
      _count: { _all: true },
    }),
    prisma.task.groupBy({
      by: ["assignedToId"],
      where: { assignedToId: { in: ids }, status: { not: "delivered_and_uploaded" } },
      _count: { _all: true },
    }),
  ]);
  const count = (rows: { assignedToId: string | null; _count: { _all: number } }[], id: string) =>
    rows.find((r) => r.assignedToId === id)?._count._all ?? 0;

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
    openWork: count(openWork, p.id),
    doneWork: count(doneWork, p.id),
    clientLoad: count(clientLoad, p.id),
  }));

  return (
    <div className="h-full">
      <PeopleDirectory
        people={records}
        teams={teams.map((t) => ({ id: t.id, name: t.name }))}
        jobTitles={jobTitles.map((j) => ({ id: j.id, name: j.name }))}
        canEdit={canEdit}
        meId={me.id}
      />
    </div>
  );
}
