import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { LIVE_TASK, LIVE_WORK_TASK } from "@/lib/workflow";
import { dayOf } from "@/lib/editorKpi";
import { visibleDepartments } from "./departments";
import { OrgMap } from "./OrgMap";

export const dynamic = "force-dynamic";

// The agency's work as a radar (OrgMap): a spoke a department, reaching as far
// as its open work, each opening its own page. Only the departments someone
// is in (Level 1: all).
export default async function OrganizationPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const departments = await visibleDepartments(viewer);
  // the start of today in IST: anything due before it and not done is late
  const today = new Date(`${dayOf(new Date())}T00:00:00+05:30`);
  const ids = departments.map((d) => d.id);
  const [people, tasks, todos] = await Promise.all([
    prisma.user.findMany({ where: { employment: { not: "former" } }, select: { teamId: true, departments: { select: { id: true } } } }),
    prisma.task.findMany({ where: { AND: [LIVE_TASK, { teamId: { in: ids } }] }, select: { teamId: true, dueDate: true, handedOffAt: true } }),
    prisma.workTask.findMany({ where: { AND: [LIVE_WORK_TASK, { teamId: { in: ids } }] }, select: { teamId: true, dueDate: true } }),
  ]);
  const members = (id: string) => people.filter((p) => p.teamId === id || p.departments.some((d) => d.id === id));
  const work = [...tasks.map((t) => ({ teamId: t.teamId, late: !!t.dueDate && !t.handedOffAt && t.dueDate < today })), ...todos.map((t) => ({ teamId: t.teamId, late: !!t.dueDate && t.dueDate < today }))];
  const map = departments.map((d) => ({
    slug: d.slug,
    name: d.name,
    open: work.filter((w) => w.teamId === d.id).length,
    late: work.filter((w) => w.teamId === d.id && w.late).length,
  }));

  if (departments.length === 0)
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Organization</h1>
        <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">You aren&apos;t in a department yet.</p>
      </div>
    );
  return (
    <div className="flex h-full min-h-0 flex-col">
      <OrgMap departments={map} people={new Set(departments.flatMap((d) => members(d.id))).size} />
    </div>
  );
}
